import {
  canAdminister,
  isPublicPreview,
  permissionsFor,
  type Session,
} from "./api";
import { administrationRoutes } from "./app-routes";
import { PageHeading } from "./components";
import { msg } from "./messages";
import { RolePermissionNotice } from "./role-guide";
import { Billing } from "./billing-page";
import { TeamAdmin } from "./administration-team";
import { TeamInvitations } from "./team-invitations";
import { AdministrationSettings } from "./administration-settings";
import { UsageLedger } from "./administration-operations";
import {
  AdministrationActivityPage,
  AdministrationAuditPage,
  AdministrationConnectionsPage,
  AdministrationConsumptionPage,
  AdministrationMemberActivity,
  AdministrationOverviewPage,
  AdministrationReportsPage,
  PreviewUnavailable,
} from "./administration-views";
import "./administration.css";

/**
 * Workspace administration. Authority is the current membership: reports for
 * administrators and supervisors with report permission, members, access,
 * billing and settings for administrators. Every read is rechecked by the
 * server; this routing only chooses what to show.
 */
export default function Administration({
  route,
  session,
  onUpdated,
}: {
  route: string;
  session: Session;
  onUpdated: () => void | Promise<void>;
}) {
  const path = route.split("?")[0] ?? administrationRoutes.home;
  const permissions = permissionsFor(session);
  const admin = canAdminister(session);
  const reports = permissions.viewReports;
  const adminOnly = [
    administrationRoutes.members,
    administrationRoutes.connections,
    administrationRoutes.audit,
    administrationRoutes.billing,
    administrationRoutes.settings,
  ] as string[];
  if (!admin && !reports && !adminOnly.includes(path))
    return <RolePermissionNotice reports />;
  if (!admin && adminOnly.includes(path))
    return (
      <>
        <PageHeading title={msg("Administration")} />
        <RolePermissionNotice />
      </>
    );
  const previewReport = (title: string) => (
    <>
      <PageHeading title={title} />
      <PreviewUnavailable />
    </>
  );
  switch (path) {
    case administrationRoutes.activity:
      return isPublicPreview ? (
        previewReport(msg("Workspace activity"))
      ) : (
        <AdministrationActivityPage route={route} />
      );
    case administrationRoutes.consumption:
      return isPublicPreview ? (
        <>
          {previewReport(msg("Consumption"))}
          <UsageLedger />
        </>
      ) : (
        <AdministrationConsumptionPage route={route} />
      );
    case administrationRoutes.reports:
      return isPublicPreview ? (
        previewReport(msg("Reports and exports"))
      ) : (
        <AdministrationReportsPage
          route={route}
          canManageMembers={permissions.manageMembers}
        />
      );
    case administrationRoutes.members:
      return (
        <>
          <PageHeading
            title={msg("Members and invitations")}
            intro={msg(
              "Roles, approval and report permissions, access and invitations of this workspace.",
            )}
          />
          <TeamAdmin session={session} onUpdated={onUpdated} />
          {!isPublicPreview && <TeamInvitations />}
          {!isPublicPreview && <AdministrationMemberActivity route={route} />}
        </>
      );
    case administrationRoutes.connections:
      return isPublicPreview ? (
        previewReport(msg("Access and sign-ins"))
      ) : (
        <AdministrationConnectionsPage route={route} />
      );
    case administrationRoutes.audit:
      return isPublicPreview ? (
        previewReport(msg("Audit log"))
      ) : (
        <AdministrationAuditPage route={route} />
      );
    case administrationRoutes.billing:
      return <Billing session={session} />;
    case administrationRoutes.settings:
      return <AdministrationSettings session={session} onUpdated={onUpdated} />;
    default:
      return isPublicPreview ? (
        previewReport(msg("Workspace overview"))
      ) : (
        <AdministrationOverviewPage route={route} />
      );
  }
}
