# Meeting Extraction Agent

POST /api/v1/transcripts/{transcript_id}/extract queues a Celery extraction job.
GET /api/v1/transcripts/{transcript_id}/extraction returns its durable status and
structured result.

The agent only uses final transcript chunks and supplies their UUIDs, speaker labels,
timestamps, and text to the model. The response schema requires evidence references
and confidence on every decision, task, risk, and question. References are verified
against the source transcript before persistence. Decisions retain source references;
tasks retain evidence, confidence, normalized owner IDs when the display name matches
a workspace member, due dates, and directed dependency edges.

Set AI_PROVIDER=openai with OPENAI_API_KEY and MEETING_EXTRACTION_MODEL=gpt-5.6, or
set AI_PROVIDER=cerebras with CEREBRAS_API_KEY and CEREBRAS_MODEL=gpt-oss-120b.
Provider calls retry malformed, rejected, and transient responses three times with
exponential backoff; a failed extraction stores a durable error state.
