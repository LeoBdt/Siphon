import {
  AuditCard,
  GroupsCard,
  InvitesCard,
  MembersCard,
} from "@/components/settings/accounts";

export default function AccountsSettingsPage() {
  return (
    <>
      <MembersCard />
      <InvitesCard />
      <GroupsCard />
      <AuditCard />
    </>
  );
}
