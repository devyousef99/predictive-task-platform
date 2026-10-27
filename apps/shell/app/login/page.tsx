import { GuestOnly, LoginScreen } from "@ptp/ui";

/** The login page is the entry point; an already signed-in user is sent to their role's home page. */
export default function Page() {
  return <GuestOnly><LoginScreen /></GuestOnly>;
}
