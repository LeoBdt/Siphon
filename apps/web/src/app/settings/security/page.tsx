import {
  PrivateFolderCard,
  SecondFactorCard,
} from "@/components/settings/security";

/** What protects the account, and what it keeps out of other people's sight. */
export default function SecuritySettingsPage() {
  return (
    <>
      <SecondFactorCard />
      <PrivateFolderCard />
    </>
  );
}
