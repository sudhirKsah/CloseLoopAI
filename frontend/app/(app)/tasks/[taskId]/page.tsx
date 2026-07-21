import { TaskDetailPage } from "@/components/detail-pages";
export default async function Page({ params }: { params:Promise<{taskId:string}> }) { const { taskId } = await params; return <TaskDetailPage taskId={taskId}/>; }
