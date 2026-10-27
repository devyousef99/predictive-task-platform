import { GuestOnly, VerifyOtpScreen } from "@ptp/ui";

/** Step 2 of sign-in (emailed code). The pending login lives in the shared auth store (sessionStorage). */
export default function Page() {
  return <GuestOnly><VerifyOtpScreen /></GuestOnly>;
}
