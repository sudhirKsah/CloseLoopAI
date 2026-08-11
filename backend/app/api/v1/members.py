import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...api.deps import require_workspace_admin
from ...db.session import get_session
from ...models.core import ExternalIdentity, User, WorkspaceMember
from ...models.integrations import Integration, IntegrationProvider, OAuthCredential
from ...services.credentials import CredentialVault
from ...services.directory import (
    IMPORT_TEMPLATE_HEADERS,
    MemberInput,
    DirectoryError,
    parse_members_file,
    upsert_member,
)
from ...services.slack import SlackClient

router = APIRouter(prefix="/workspaces", tags=["team-directory"])


class MemberPayload(BaseModel):
    name: str
    email: str | None = None
    title: str | None = None
    department: str | None = None
    role: str = "member"
    skills: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    external_ids: dict[str, str] = Field(default_factory=dict)


async def _serialize(session: AsyncSession, workspace_id) -> list[dict]:
    rows = (
        await session.execute(
            select(User, WorkspaceMember)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .where(WorkspaceMember.workspace_id == workspace_id)
        )
    ).all()
    users = {user.id: (user, member) for user, member in rows}
    identities: dict[uuid.UUID, dict[str, str]] = {uid: {} for uid in users}
    if users:
        for identity in (
            (
                await session.execute(
                    select(ExternalIdentity).where(
                        ExternalIdentity.user_id.in_(list(users.keys()))
                    )
                )
            )
            .scalars()
            .all()
        ):
            identities.setdefault(identity.user_id, {})[identity.provider] = (
                identity.external_user_id
            )
    return [
        {
            "id": str(user.id),
            "name": user.display_name,
            "email": user.email,
            "title": user.title,
            "department": user.department,
            "role": member.role.value,
            "skills": user.skills,
            "aliases": user.aliases,
            "dashboard_access": user.is_login_enabled,
            "external_ids": identities.get(user.id, {}),
        }
        for user, member in users.values()
    ]


@router.get("/{workspace_id}/members")
async def list_members(
    workspace_id: uuid.UUID,
    _=Depends(require_workspace_admin),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    return await _serialize(session, workspace_id)


@router.get("/{workspace_id}/members/template", response_class=PlainTextResponse)
async def import_template(
    workspace_id: uuid.UUID,
    _=Depends(require_workspace_admin),
) -> str:
    example = (
        "Dave Rao,dave@acme.com,Senior Engineer,Platform,member,"
        '"python;postgres","dave;d.rao",U012ABC,557058:abc-123,daverao,'
    )
    return ",".join(IMPORT_TEMPLATE_HEADERS) + "\n" + example + "\n"


@router.post("/{workspace_id}/members")
async def add_member(
    workspace_id: uuid.UUID,
    body: MemberPayload,
    _=Depends(require_workspace_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    try:
        user = await upsert_member(
            session, workspace_id, MemberInput(**body.model_dump())
        )
    except DirectoryError as error:
        raise HTTPException(400, str(error))
    await session.commit()
    members = await _serialize(session, workspace_id)
    return next(m for m in members if m["id"] == str(user.id))


@router.patch("/{workspace_id}/members/{user_id}")
async def edit_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberPayload,
    _=Depends(require_workspace_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    membership = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(404, "Member not found in this workspace")
    try:
        await upsert_member(session, workspace_id, MemberInput(**body.model_dump()))
    except DirectoryError as error:
        raise HTTPException(400, str(error))
    await session.commit()
    members = await _serialize(session, workspace_id)
    return next(m for m in members if m["id"] == str(user_id))


@router.delete("/{workspace_id}/members/{user_id}", status_code=204)
async def remove_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    _=Depends(require_workspace_admin),
    session: AsyncSession = Depends(get_session),
) -> None:
    membership = (
        await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(404, "Member not found in this workspace")
    await session.delete(membership)
    await session.commit()


@router.post("/{workspace_id}/members/import")
async def import_members(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    _=Depends(require_workspace_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    content = await file.read()
    try:
        members = parse_members_file(file.filename or "", content)
    except DirectoryError as error:
        raise HTTPException(400, str(error))
    if not members:
        raise HTTPException(400, "No member rows found. A 'name' column is required.")
    created = 0
    errors: list[str] = []
    for member in members:
        try:
            await upsert_member(session, workspace_id, member)
            created += 1
        except DirectoryError as error:
            errors.append(f"{member.name}: {error}")
    await session.commit()
    return {"imported": created, "skipped": len(errors), "errors": errors[:20]}


@router.post("/{workspace_id}/members/sync/slack")
async def sync_slack_directory(
    workspace_id: uuid.UUID,
    _=Depends(require_workspace_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    integration = (
        await session.execute(
            select(Integration).where(
                Integration.workspace_id == workspace_id,
                Integration.provider == IntegrationProvider.SLACK,
            )
        )
    ).scalar_one_or_none()
    if not integration:
        raise HTTPException(400, "Slack is not connected for this workspace")
    credential = (
        await session.execute(
            select(OAuthCredential).where(
                OAuthCredential.integration_id == integration.id
            )
        )
    ).scalar_one_or_none()
    if not credential:
        raise HTTPException(400, "Slack credential missing")
    token = CredentialVault().decrypt(credential.access_token_encrypted)
    linked = 0
    for slack_user in await SlackClient().team_users(token):
        if slack_user.get("deleted") or slack_user.get("is_bot"):
            continue
        profile = slack_user.get("profile", {})
        email = profile.get("email")
        name = (
            profile.get("real_name")
            or slack_user.get("real_name")
            or slack_user.get("name")
        )
        if not name:
            continue
        await upsert_member(
            session,
            workspace_id,
            MemberInput(
                name=name,
                email=email,
                title=profile.get("title") or None,
                external_ids={"slack": slack_user["id"]},
            ),
        )
        linked += 1
    await session.commit()
    return {"synced": linked}
