# Créer un modèle Guteneo depuis un assistant

Le serveur est l’autorité. Lire get_capabilities, puis
get_template_authoring_guide avant de construire une définition. Cette référence
est embarquée dans le plugin ; le guide vivant contient les schémas JSON issus du
validateur courant, les liaisons, les modifications sémantiques, les propriétés
graphiques autorisées et les limites. Ne pas supposer la présence d’un outil qui
n’est pas annoncé par le serveur connecté.

## Partir d’un exemple complet

list_template_examples propose un courrier, une facture de démonstration, un
relevé, un devis et un bon de livraison. get_template_example avec exampleId
retourne {id,envelope}. Modifier envelope, puis transmettre {envelope} à
create_template. Le brouillon appartient à l’utilisateur authentifié ; il reste
privé jusqu’à un partage explicite. Lire une démonstration ne crée rien et ne
modifie pas la galerie commune. Les exemples ne revendiquent aucune conformité
fiscale ou validation métier particulière.

## Règles à respecter

- Version : schemaVersion 1, engine pdfme et engineVersion 6.1.13. basePdf est un
  objet de dimensions et marges en millimètres. Les tailles de police sont en
  points, avec la police embarquée GuteneoSans et du texte simple.
- Déclarer l’objet métier dans inputSchema et des exemples entièrement fictifs
  dans sampleData ; sampleDataSynthetic reste true. Garder resources vide.
- Relier les blocs avec bindings : value pour un champ, table pour un tableau,
  sum pour un total. Les noms des blocs et les chemins du schéma doivent exister.
  Les chemins des colonnes sont relatifs à une ligne, ceux des conditions à la racine.
- Ne pas écrire de variables entre accolades dans le contenu graphique ; seuls
  les compteurs {currentPage} et {totalPages} sont permis. Aucun JavaScript,
  expression, SVG, police distante ou image distante.
- Les montants sont des entiers en unités mineures ; 1250 signifie 12,50 EUR.
  Les dates sont ISO YYYY-MM-DD. Un code postal ou un identifiant reste une chaîne.
- Les champs required doivent être fournis ou disposer d’un default valide.
  Ne jamais inventer une valeur manquante ou un taux de conversion.
- Un tableau dynamique utilise repeatHead=true et un nombre de colonnes identique
  dans head et dans le binding. Vérifier le PDF réel pour la pagination et les
  superpositions. Le schéma JSON ne suffit pas à qualifier la mise en page.

## Enveloppe minimale exécutable

Le corps ci-dessous s’utilise tel quel avec create_template, ou avec
POST /api/templates. Il crée uniquement un brouillon privé.

```json
{
  "envelope": {
    "schemaVersion": 1,
    "engine": "pdfme",
    "engineVersion": "6.1.13",
    "name": "Mon premier modèle",
    "description": "Exemple minimal avec une variable et des données fictives.",
    "locale": "fr-FR",
    "definition": {
      "basePdf": {
        "width": 210,
        "height": 297,
        "padding": [
          22,
          20,
          20,
          20
        ],
        "staticSchema": [
          {
            "name": "header",
            "type": "text",
            "position": {
              "x": 20,
              "y": 10
            },
            "width": 170,
            "height": 6,
            "content": "ENTREPRISE EXEMPLE",
            "readOnly": true,
            "fontName": "GuteneoSans",
            "fontSize": 8,
            "fontColor": "#202827",
            "lineHeight": 1.25,
            "characterSpacing": 0,
            "alignment": "left",
            "verticalAlignment": "top",
            "overflow": "expand"
          },
          {
            "name": "footer",
            "type": "text",
            "position": {
              "x": 20,
              "y": 283
            },
            "width": 170,
            "height": 6,
            "content": "Données fictives · Page {currentPage} / {totalPages}",
            "readOnly": true,
            "fontName": "GuteneoSans",
            "fontSize": 8,
            "fontColor": "#202827",
            "lineHeight": 1.25,
            "characterSpacing": 0,
            "alignment": "left",
            "verticalAlignment": "top",
            "overflow": "expand"
          }
        ]
      },
      "schemas": [
        [
          {
            "name": "greeting",
            "type": "text",
            "position": {
              "x": 20,
              "y": 35
            },
            "width": 170,
            "height": 15,
            "content": "Bonjour",
            "readOnly": true,
            "fontName": "GuteneoSans",
            "fontSize": 18,
            "fontColor": "#202827",
            "lineHeight": 1.25,
            "characterSpacing": 0,
            "alignment": "left",
            "verticalAlignment": "top",
            "overflow": "expand"
          }
        ]
      ],
      "pdfmeVersion": "6.1.13"
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "personName": {
          "type": "string",
          "title": "Prénom",
          "maxLength": 160
        }
      },
      "required": [
        "personName"
      ]
    },
    "bindings": [
      {
        "block": "greeting",
        "kind": "value",
        "path": "personName",
        "format": "text",
        "required": true,
        "prefix": "Bonjour "
      }
    ],
    "sampleData": {
      "personName": "Camille Exemple"
    },
    "sampleDataSynthetic": true,
    "resources": []
  }
}
```

## Relire, publier et partager

Après création, conserver id et revision retournés. preview_template reçoit
{id,expectedRevision,data} et retourne un véritable aperçu documentaire.
Relire le PDF avec les outils documentaires disponibles ; corriger les erreurs
avant publication. update_template reçoit {id,change:{expectedRevision,patch}}
ou change.envelope pour une définition complète. Le guide fournit patchSchema.
Après REVISION_CONFLICT, relire get_template ; ne pas écraser une modification
concurrente et ne pas incrémenter une révision devinée.

publish_template reçoit {id,expectedRevision} et fige une version. share_template
reste une action distincte avec des droits explicites. Une création, un aperçu,
une publication et une génération ne valent jamais approbation d’envoi.

## Supprimer une création à la demande de son propriétaire

Lire canDelete dans get_template, puis appeler delete_template avec
{id,expectedRevision}. Le modèle disparaît de la bibliothèque de l’atelier, y
compris s’il avait été partagé ; les PDF déjà générés et leur historique restent
conservés. Un autre membre ayant un droit d’édition ou de publication ne devient
pas propriétaire. La suppression d’une copie ne supprime jamais sa base dans la
galerie de démonstration. Ne pas assimiler cette action à un effacement des PDF.

## Équivalents REST

- GET /api/templates/authoring-guide
- GET /api/templates/examples
- GET /api/templates/examples/{exampleId}
- POST /api/templates avec {envelope}
- DELETE /api/templates/{id} avec {expectedRevision}

Les lectures utilisent templates:read ; créer, modifier et supprimer nécessitent
templates:write. L’aperçu requiert generations:write. Publier et partager ont leurs scopes distincts. L’appartenance
et les droits sont toujours vérifiés par le serveur. Aucun appel OpenAI interne,
aucune clé supplémentaire et aucun accès au fournisseur d’envoi ne sont requis
pour qu’un LLM compose une enveloppe lui-même.
