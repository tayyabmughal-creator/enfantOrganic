import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

function resolveExpectedAuthHeader() {
  const secret = (process.env.REVALIDATION_SECRET || "").trim();
  if (secret) {
    return `Bearer ${secret}`;
  }
  if (process.env.NODE_ENV === "development") {
    const devSecret = (process.env.REVALIDATION_SECRET_DEV || "").trim();
    if (devSecret) {
      return `Bearer ${devSecret}`;
    }
  }
  return null;
}

export async function POST(request) {
  try {
    const expectedAuth = resolveExpectedAuthHeader();
    if (!expectedAuth) {
      return NextResponse.json(
        { message: "Revalidation is not configured (set REVALIDATION_SECRET)." },
        { status: 503 },
      );
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== expectedAuth) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { path, tag } = await request.json();

    if (path) {
      revalidatePath(path);
      return NextResponse.json({ revalidated: true, now: Date.now(), path });
    }

    if (tag) {
      revalidateTag(tag);
      return NextResponse.json({ revalidated: true, now: Date.now(), tag });
    }

    return NextResponse.json({ message: "Missing path or tag" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ message: "Error revalidating", error: err.message }, { status: 500 });
  }
}
