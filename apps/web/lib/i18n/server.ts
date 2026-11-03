import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang, type Lang } from "./dictionary";

/** The interface language chosen with the toggle (a cookie, so server pages render in it). */
export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}
