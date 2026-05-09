import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChatMessageRecord } from "@/lib/admin/types";

export function ChatsTable({ rows }: { rows: ChatMessageRecord[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat logs</CardTitle>
        <CardDescription>
          Inspect every user query, response, RAG source, retrieved context, and quality signal.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="min-w-[1180px]">
          <TableHeader>
            <TableRow>
              <TableHead>User query</TableHead>
              <TableHead>AI response</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>RAG details</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[240px] align-top">
                  <div className="space-y-2">
                    <p className="font-medium">{row.userQuery}</p>
                    <div className="space-y-1 text-xs text-slate-400">
                      <p>Session: {row.sessionId}</p>
                      <p>User: {row.userId}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-[340px] align-top text-slate-400">
                  <div className="space-y-2">
                    <p>{row.aiResponse || "No response captured."}</p>
                    <p className="text-xs text-slate-500">{row.detailsSummary}</p>
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="secondary">{row.sourceLabel}</Badge>
                </TableCell>
                <TableCell className="max-w-[280px] align-top">
                  {row.retrievedContext.length > 0 ? (
                    <div className="space-y-2">
                      {row.retrievedContext.slice(0, 3).map((item) => (
                        <div
                          key={`${row.id}-${item.id}`}
                          className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                        >
                          <p className="text-sm font-medium text-white">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {item.source} · {item.category}
                          </p>
                        </div>
                      ))}
                      {row.retrievedContext.length > 3 ? (
                        <p className="text-xs text-slate-500">
                          +{row.retrievedContext.length - 3} more context matches
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No retrieved context saved.</p>
                  )}
                </TableCell>
                <TableCell className="capitalize">{row.intent}</TableCell>
                <TableCell className="text-slate-400">{new Date(row.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={row.status === "success" ? "success" : "destructive"}>{row.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{Math.round(row.confidenceScore * 100)}%</span>
                      <span>{row.responseTimeMs} ms</span>
                    </div>
                    <Progress value={Math.round(row.confidenceScore * 100)} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
