import { Fragment, useState } from "react";
import { AlertCircle, Calculator, CheckCircle2, FileInput, Play, XCircle } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { useStore } from "../lib/store";
import { StatisticalAuditService, apiConfig, type StatisticalFinding, type StatisticalRecomputeResult } from "../lib/apiClient";

function fmtP(value: number) {
  if (!Number.isFinite(value)) return "n/a";
  if (value < 0.0001) return value.toExponential(2);
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtInputs(inputs: Record<string, number>) {
  return Object.entries(inputs)
    .map(([key, value]) => `${key}=${fmtP(value)}`)
    .join(", ");
}

function prettyTest(name: string) {
  return name.replace(/_/g, " ");
}

function pdfHref(paperId: string, finding: StatisticalFinding) {
  if (!finding.evidence.page) return undefined;
  return `${apiConfig.baseUrl}/ingest/pdf-file?id=${encodeURIComponent(paperId)}#page=${finding.evidence.page}`;
}

export function RecomputePage() {
  const store = useStore();
  const paper = store.paperUnderAudit;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StatisticalRecomputeResult | null>(null);

  async function runAudit() {
    if (!paper) return;
    setBusy(true);
    setError("");
    try {
      setResult(await StatisticalAuditService.recompute(paper));
    } catch (e: any) {
      setError(e?.message || "Statistical recompute failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!paper) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-muted p-3"><FileInput className="size-5 text-muted-foreground" /></div>
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">No paper loaded</h2>
              <p className="text-sm text-muted-foreground">Upload or fetch a paper in Ingest first.</p>
            </div>
            <Button onClick={() => store.setPage("ingest")} variant="outline">Open Ingest</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-3"><Calculator className="size-5 text-primary" /></div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold truncate">{paper.title || "Paper under audit"}</h2>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{paper.num_pages ?? "?"} pages</Badge>
                <Badge variant="outline">{paper.char_count.toLocaleString()} chars</Badge>
                <Badge variant="outline">{paper.full_text_source || paper.source}</Badge>
              </div>
            </div>
          </div>
          <Button onClick={runAudit} disabled={busy || !paper.full_text} className="gap-2 md:self-start">
            <Play className="size-4" />
            {busy ? "Running" : "Run"}
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-destructive/40">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {error}
          </div>
        </Card>
      )}

      {result && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Claims</div>
              <div className="text-2xl font-semibold">{result.claim_count}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Mismatches</div>
              <div className="text-2xl font-semibold">{result.mismatch_count}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Supported Tests</div>
              <div className="text-sm font-medium">t, F, chi-square, r</div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Claim</th>
                    <th className="px-4 py-3 font-medium text-right">Page</th>
                    <th className="px-4 py-3 font-medium">Source Quote</th>
                    <th className="px-4 py-3 font-medium text-right">Computed p</th>
                    <th className="px-4 py-3 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {result.findings.map((finding, index) => (
                    <Fragment key={`${finding.claim}-${index}`}>
                      <tr className="border-t">
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={finding.status === "mismatch"
                              ? "border-destructive/40 text-destructive"
                              : "border-emerald-500/30 text-emerald-600"}
                          >
                            {finding.status === "mismatch"
                              ? <XCircle className="mr-1 size-3" />
                              : <CheckCircle2 className="mr-1 size-3" />}
                            {finding.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3"><code className="text-xs">{finding.claim}</code></td>
                        <td className="px-4 py-3 text-right">{finding.evidence.page ?? "n/a"}</td>
                        <td className="px-4 py-3 max-w-md">
                          {pdfHref(paper.id, finding) ? (
                            <a
                              className="text-primary hover:underline"
                              href={pdfHref(paper.id, finding)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {finding.evidence.quote}
                            </a>
                          ) : finding.evidence.quote}
                        </td>
                        <td className="px-4 py-3 text-right">{fmtP(finding.recomputed_p)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{finding.note}</td>
                      </tr>
                      <tr className="border-t bg-muted/20">
                        <td colSpan={6} className="px-4 py-3">
                          <details className="rounded-md border bg-background p-3" open={finding.status === "mismatch"}>
                            <summary className="cursor-pointer text-sm font-medium">Why this was flagged</summary>
                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">Where the claim came from</div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <div className="text-xs text-muted-foreground">Page</div>
                                    <div className="text-sm">{finding.evidence.page ?? "unavailable"}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-muted-foreground">Section</div>
                                    <div className="text-sm">{finding.evidence.section || "unavailable"}</div>
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground">Source quote</div>
                                <blockquote className="text-sm border-l pl-3 text-muted-foreground">{finding.evidence.quote}</blockquote>
                                <div className="text-xs text-muted-foreground">Exact match</div>
                                <code className="block text-xs bg-muted p-2 rounded">{finding.evidence.exact_quote}</code>
                                <details className="rounded-md border p-3 text-xs">
                                  <summary className="cursor-pointer font-medium">Advanced trace</summary>
                                  <div className="mt-2 space-y-2 text-muted-foreground">
                                    <div>
                                      <div className="font-medium text-foreground">Character offsets</div>
                                      <div>Claim: <code>{finding.evidence.start_char}..{finding.evidence.end_char}</code></div>
                                      <div>Full quote: <code>{finding.evidence.quote_start_char}..{finding.evidence.quote_end_char}</code></div>
                                    </div>
                                    <div>
                                      <div className="font-medium text-foreground">PDF highlight boxes</div>
                                      <code className="block bg-muted p-2 rounded">{JSON.stringify(finding.evidence.bboxes)}</code>
                                    </div>
                                  </div>
                                </details>
                              </div>
                              <div className="space-y-3">
                                <div className="text-xs font-medium text-muted-foreground">Math breakdown</div>
                                <ol className="space-y-3 text-sm">
                                  <li>
                                    <div className="font-medium">1. Identify the test</div>
                                    <div className="text-muted-foreground">{prettyTest(finding.math.test)}</div>
                                  </li>
                                  <li>
                                    <div className="font-medium">2. Extract the reported values</div>
                                    <code className="block text-xs bg-muted p-2 rounded">{fmtInputs(finding.math.inputs)}</code>
                                  </li>
                                  <li>
                                    <div className="font-medium">3. Use the p-value formula</div>
                                    <code className="block text-xs bg-muted p-2 rounded">{finding.math.formula}</code>
                                  </li>
                                  <li>
                                    <div className="font-medium">4. Substitute the extracted values</div>
                                    <code className="block text-xs bg-muted p-2 rounded">{finding.math.substitution}</code>
                                  </li>
                                  <li>
                                    <div className="font-medium">5. Recompute and compare</div>
                                    <div>
                                      Reported <code>{finding.reported_p}</code>; recomputed <code>p={fmtP(finding.math.result)}</code>.
                                    </div>
                                  </li>
                                  <li>
                                    <div className="font-medium">6. Verdict</div>
                                    <div className={finding.status === "mismatch" ? "text-destructive" : "text-emerald-600"}>
                                      {finding.status}: {finding.note}
                                    </div>
                                  </li>
                                </ol>
                              </div>
                            </div>
                          </details>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {result.findings.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              No supported statistical claims were found.
            </Card>
          )}
        </>
      )}
    </div>
  );
}
