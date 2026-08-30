import { NextResponse } from "next/server";

export type FormRedirectOptions = {
  replace?: boolean;
  refresh?: boolean;
};

function isProgressiveFormRequest(request: Request) {
  return (
    request.headers.get("x-requested-with")?.toLocaleLowerCase("en-US") ===
    "xmlhttprequest"
  );
}

/**
 * Returns a compact navigation instruction to progressively enhanced forms,
 * while preserving the exact 303 redirect used by native and no-JavaScript
 * submissions.
 */
export function formActionRedirect(
  request: Request,
  destination: URL | string,
  options: FormRedirectOptions = {},
) {
  const url =
    destination instanceof URL
      ? destination
      : new URL(destination, request.url);

  if (isProgressiveFormRequest(request)) {
    return NextResponse.json({
      ok: true,
      redirect: url.toString(),
      ...(options.replace ? { replace: true } : {}),
      ...(options.refresh ? { refresh: true } : {}),
    });
  }

  return NextResponse.redirect(url, 303);
}
