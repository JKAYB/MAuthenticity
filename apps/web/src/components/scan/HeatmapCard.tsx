import { useState } from "react";
import { AlertTriangle, RefreshCcw, ExternalLink } from "lucide-react";

type Heatmap = {
  modelName: string;
  url: string;
};

export function HeatMapCard({ heatmap }: { heatmap: Heatmap }) {
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1); // force reload
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-input/30 p-3">
      <div className="mb-2 text-sm font-medium break-words">
        {heatmap.modelName}
      </div>

      {failed ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/40 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <span>Heatmap expired (secure link timed out)</span>

          <div className="flex gap-2 mt-2">
            <button
              onClick={retry}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <RefreshCcw className="h-3 w-3" />
              Retry
            </button>

            <a
              href={heatmap.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          </div>
        </div>
      ) : (
        <img
          key={retryKey}
          src={heatmap.url}
          alt={`${heatmap.modelName} heatmap`}
          className="h-40 w-full rounded-md border border-border object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}