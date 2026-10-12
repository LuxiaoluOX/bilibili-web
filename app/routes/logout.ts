import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { logout } from "../lib/auth.server";

export async function action({ request }: Route.ActionArgs) {
  const cookie = await logout(request);
  throw redirect("/login", { headers: { "Set-Cookie": cookie } });
}
