import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import { msg } from "./messages";
import { RolesFilm } from "./homepage-film";
import "./role-guide.css";

export function roleLabel(role: string): string {
  const labels: Record<WorkspaceRole, string> = {
    admin: msg("Administrateur"),
    supervisor: msg("Superviseur"),
    member: msg("Opérateur"),
    viewer: msg("Observateur"),
  };
  return labels[role as WorkspaceRole] ?? role;
}

export function roleDescription(role: string): string {
  const descriptions: Record<WorkspaceRole, string> = {
    admin: msg(
      "Gère l’atelier, ses membres, la facturation et les délégations. Prépare, approuve et consulte tous les rapports.",
    ),
    supervisor: msg(
      "Prépare les documents et les envois. L’administrateur choisit séparément son droit d’approbation et son accès aux rapports.",
    ),
    member: msg(
      "Importe les documents et prépare les envois. Un administrateur ou un superviseur autorisé doit les approuver.",
    ),
    viewer: msg(
      "Consulte les documents, les destinataires et le suivi des envois de l’atelier, sans les modifier.",
    ),
  };
  return descriptions[role as WorkspaceRole] ?? "";
}

export function RolesOverview() {
  return (
    <dl className="role-guide-list">
      {WORKSPACE_ROLES.map((role) => (
        <div key={role}>
          <dt>{roleLabel(role)}</dt>
          <dd>{roleDescription(role)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RolePermissionNotice({
  reports = false,
}: {
  reports?: boolean;
}) {
  return (
    <div className="notice info" role="note">
      <p>
        {reports
          ? msg(
              "Votre rôle ne donne pas accès aux rapports de l’atelier. Un administrateur peut modifier vos droits.",
            )
          : msg(
              "Votre rôle ne permet pas cette action. Un administrateur peut modifier vos droits.",
            )}{" "}
        <a href="/roles/">{msg("Comprendre les rôles")}</a>
      </p>
    </div>
  );
}

export function getRoleGuide() {
  return {
    label: msg("Rôles et droits"),
    title: msg("Un rôle clair pour chaque membre."),
    description: msg(
      "Choisissez qui prépare la correspondance, qui autorise les envois et qui consulte les rapports de votre atelier.",
    ),
    updated: msg("Mise à jour le 2 octobre 2026"),
    sections: [
      {
        id: "roles",
        label: msg("Les quatre rôles"),
        content: (
          <>
            <RolesFilm />
            <h2>{msg("Les quatre rôles")}</h2>
            <RolesOverview />
            <p>
              {msg(
                "Chaque personne a un rôle propre à chaque atelier. Tous les rôles donnent accès aux documents, aux destinataires et au suivi de cet atelier : le rôle Observateur ne masque pas les contenus sensibles.",
              )}
            </p>
          </>
        ),
      },
      {
        id: "superviseur",
        label: msg("Les droits du superviseur"),
        content: (
          <>
            <h2>{msg("Les droits du superviseur")}</h2>
            <p>
              {msg(
                "Deux options indépendantes, désactivées par défaut, permettent d’adapter ce rôle à votre équipe.",
              )}
            </p>
            <dl className="role-guide-list">
              <div>
                <dt>{msg("Approuver et refuser les requêtes")}</dt>
                <dd>
                  {msg(
                    "Autorise la revue et le transfert du PDF postal, l’approbation du contenu et du coût, la confirmation de l’envoi, ainsi que l’annulation avant soumission au prestataire. Une approbation peut déclencher un envoi et consommer le crédit de l’atelier.",
                  )}
                </dd>
              </div>
              <div>
                <dt>{msg("Consulter les rapports")}</dt>
                <dd>
                  {msg(
                    "Donne accès aux indicateurs d’ensemble et au détail de la consommation. Cette option n’ouvre ni les factures, ni les paiements, ni la gestion des membres.",
                  )}
                </dd>
              </div>
            </dl>
            <p>
              {msg(
                "Un superviseur sans ces options prépare les envois comme un opérateur. Avec les rapports seuls, il suit l’activité sans autoriser d’envoi ; avec l’approbation seule, il valide les requêtes sans consulter les rapports.",
              )}
            </p>
          </>
        ),
      },
      {
        id: "choisir",
        label: msg("Choisir et modifier un rôle"),
        content: (
          <>
            <h2>{msg("Choisir et modifier un rôle")}</h2>
            <p>
              {msg(
                "La personne qui crée un atelier en devient administrateur. Elle peut ensuite inviter des membres avec une adresse e-mail ou un fichier CSV, vérifier les destinataires et leur rôle, puis envoyer les invitations. Chaque invité rejoint l’atelier en créant un compte ou en se connectant avec l’adresse vérifiée qui a reçu son lien personnel.",
              )}
            </p>
            <p>
              {msg(
                "Commencez par Observateur pour une consultation, Opérateur pour la préparation, et Superviseur pour une responsabilité de validation ou de reporting. Réservez Administrateur aux personnes qui gèrent réellement l’atelier.",
              )}
            </p>
            <p>
              {msg(
                "Dans l’atelier, ouvrez Administration → Membres de l’atelier. Choisissez le rôle, ajustez les deux options du superviseur, puis enregistrez. Un changement de droits déconnecte les sessions et les assistants du membre concerné ; il devra se reconnecter. Le dernier administrateur ne peut pas abandonner son rôle.",
              )}
            </p>
            <p>
              {msg(
                "Les opérateurs existants conservent la préparation mais doivent désormais confier l’approbation à un administrateur ou à un superviseur autorisé. L’accès aux rapports doit également être attribué explicitement via le rôle Superviseur.",
              )}
            </p>
          </>
        ),
      },
      {
        id: "assistants",
        label: msg("Les assistants et les limites"),
        content: (
          <>
            <h2>{msg("Les assistants et les limites")}</h2>
            <p>
              {msg(
                "Les connexions d’assistants restent limitées par les droits actuels du membre et les permissions accordées à la connexion. Un assistant ne peut pas changer les rôles ni s’accorder une délégation.",
              )}
            </p>
            <p>
              {msg(
                "Le mode expert reste distinct : seul un administrateur connecté dans le navigateur peut donner un mandat limité dans le temps à l’une de ses connexions. Le droit d’approbation d’un superviseur ne lui permet pas de créer ce mandat.",
              )}
            </p>
            <p>
              {msg(
                "Un rôle n’active pas un canal d’envoi. Les contrôles du document, du destinataire, du coût et des prestataires restent applicables. Annuler une requête est possible seulement avant sa soumission au prestataire ; un courrier déjà envoyé ne peut pas être rappelé.",
              )}
            </p>
            <p>
              {msg(
                "La facturation reste réservée aux administrateurs. Aucun rôle comptable distinct ni rôle personnalisé n’est proposé pour le moment.",
              )}
            </p>
          </>
        ),
      },
    ],
  };
}
