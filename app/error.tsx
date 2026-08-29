"use client";

import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="tapped-page ui-error-page">
      <div className="shell">
        <EmptyState
          headingLevel="h1"
          className="ui-route-error-state"
          icon={<AlertTriangle aria-hidden="true" />}
          title="This page could not be loaded."
          description="The portal hit an unexpected problem. Try the request again, or return home if it continues."
          actions={
            <>
              <button
                className="button button-primary"
                type="button"
                onClick={reset}
              >
                <RotateCcw aria-hidden="true" /> Try again
              </button>
              <Link className="button button-secondary" href="/">
                <Home aria-hidden="true" /> Home
              </Link>
            </>
          }
        />
      </div>
    </main>
  );
}
