import { MeetingDetailPage } from "@/components/detail-pages";
export default async function Page({ params }: { params:Promise<{meetingId:string}> }) { const { meetingId } = await params; return <MeetingDetailPage meetingId={meetingId}/>; }
