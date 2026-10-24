# Adobe and FileOpen: licensing and costs for Guteneo

**Subsequent decision on 24 October 2026: an in-house solution without PDF DRM was selected. See the [secure web document plan](SECURE_WEB_DOCUMENTS_PLAN.md). This licensing study remains historical research; the selected scope requires no Adobe/FileOpen negotiations.**

Research dated **24 October 2026**, supplementing the [technical DRM study](SECURE_DOCUMENT_DISTRIBUTION_STUDY.md). The recommendations below describe options considered before that decision.

Scope: Guteneo sells a SaaS feature to independent businesses, called workspaces. Each workspace protects its own confidential PDFs and distributes them to external recipients. Recipients need not be Guteneo customers and may be occasional users or receive documents from several workspaces.

This study used public official sources. No vendor was contacted, form submitted, trial activated, licensed SDK downloaded, or purchase made. No Guteneo-specific quotation or signed contract is available. Scenario amounts are feasibility calculations, **not Adobe/FileOpen prices**.

## 1. Conclusion and proposed priority

**Do not select an engine before obtaining permission for a multi-workspace SaaS and two comparable quotations.** A license allowing one company to protect its documents does not establish a right to sell that capability to third parties.

The proposed commercial priority was **FileOpen OEM**, with Adobe investigated in parallel for self-hosted/OEM and, separately, Managed Services deployment. FileOpen's documented modularity and explicit OEM route motivated this negotiation preference; neither a lower price nor acceptance of Guteneo's model was established.

Adobe remained a relevant technical benchmark. Its contractual structure and named-recipient model created an economic risk for distribution to many occasional recipients. A separate option would let each large workspace supply its own Adobe license.

**No usable official public price was found for the exact proposed service** from either vendor. Acrobat subscriptions, Adobe PDF Services, Forms Designer, software-directory prices, and FileOpen Sharebot cannot establish a budget for a Guteneo DRM/OEM agreement.

## 2. Adobe: identify the correct commercial route

### Public documents have different publication dates

| Official document | Published version/date | Use in this study |
| --- | --- | --- |
| [Enterprise general terms, French edition](https://www.adobe.com/fr/cc-shared/assets/pdf/legal/terms/enterprise/generalterms-fr-2025v1.pdf) | 2025v1; catalog: 3 October 2025 | Third-party service rights, contract precedence, recovery and exit |
| [AEM On-premise PSLT](https://www.adobe.com/cc-shared/assets/pdf/legal/terms/enterprise/pdfs/pslt-aem-onprem-ww-2025v1.pdf) | 2025v1; catalog: 3 November 2025 | Development/QA and software execution |
| [AEM On-premise description](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-on-premise-1.html) | 11 May 2023 | Document Security metrics and definitions |
| [AEM Managed Services description](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-managed-services-1.html) | 22 September 2025 | Prerequisites and scope of Adobe-managed DRM |
| [Product-specific terms catalog](https://www.adobe.com/legal/terms/enterprise-licensing/product-specific-terms.html) | Read on 24 October 2026 | Published PSLT versions at the research date |

The 2026 LTS technical documentation does not automatically replace these commercial descriptions. A quotation must identify exact products, supported LTS versions, and incorporated documents. A published page is not itself Guteneo's contract.

### Permission to provide the SaaS

Enterprise terms §4.3(B)-(C) restrict hosting, sublicensing, and services for third parties unless expressly authorized. The preamble gives the order form precedence over product-specific terms, then general terms. Permission to use a contractor (§5.2) does not establish a shared SaaS right. Obtain written permission for Guteneo's specific model. [Enterprise terms](https://www.adobe.com/fr/cc-shared/assets/pdf/legal/terms/enterprise/generalterms-fr-2025v1.pdf).

Reseller status does not automatically resolve this: the partner addendum addresses resale for a customer's own use. It may support a workspace-by-workspace arrangement without establishing OEM permission for a shared platform. [Reseller Addendum 2025v1, §2.1](https://www.adobe.com/cc-shared/assets/pdf/legal/terms/enterprise/pdfs/experiencecloud-partnerreselleraddendum-ww-2025v1.pdf).

**Proposed Guteneo requirement:** permission must cover workspace-owned documents, creation of external recipients, policy administration through Guteneo, service billing, and hosting by named subcontractors. API access must have an explicit contractual basis.

### Recipient metrics: On-premise versus Managed Services

| Route | What public documents establish | What still requires pricing or confirmation |
| --- | --- | --- |
| **On-premise** | Add-on per individual recipient, assigned to a deployment. Reassignment is limited to replacing a former recipient whose relationship has ended, or written agreement. | Minimum base product, possible OEM SKU, minimum commitment, counting period, occasional-recipient reassignment, runtime scope and cost |
| **Managed Services** | Forms Enterprise prerequisite; minimum **1,000 recipients**; one production processing instance; DRM-specific minimum availability **99.5%**. | Total base plus DRM price, DRM acceptance environment, extra capacity, enhanced availability, multi-workspace rights |

Sources: [On-premise add-on and definitions](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-on-premise-1.html), [Managed Services Document Security section](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-managed-services-1.html).

**Do not apply the 1,000-recipient minimum to On-premise: it was not established for that route.** A higher availability commitment for the Forms base also does not replace the DRM add-on commitment.

The financial model cannot treat licenses as concurrent readers or monthly active users without negotiated terms. Neither an annual counter reset nor billing only at the first click is established. The On-premise definition of User includes programmatic access: confirm whether workspace senders count as well as Guteneo operators. [On-premise definitions](https://helpx.adobe.com/legal/product-descriptions/adobe-experience-manager-on-premise-1.html).

Free Reader software does not eliminate a possible DRM-server recipient license. Distinguish **reader cost**, **permission to protect documents**, **permission to assign licenses**, and **permission to sell the service**. [Adobe Reader](https://www.adobe.com/acrobat/pdf-reader.html).

### Environments, SDK, and continuity

The On-premise PSLT permits a reasonable number of non-production copies for development, testing, and QA. General terms define strict cold recovery; warm standby or a second production installation must not be assumed included. [PSLT §1](https://www.adobe.com/cc-shared/assets/pdf/legal/terms/enterprise/pdfs/pslt-aem-onprem-ww-2025v1.pdf), [general terms §4.2](https://www.adobe.com/fr/cc-shared/assets/pdf/legal/terms/enterprise/generalterms-fr-2025v1.pdf).

Development/QA copy rights do not establish that all recipients, consumption, and add-on modules are included.

The Java SDK and access to PPL/C++ are documented, but availability is not a redistribution license or permission for unlimited autoscaling. Request separate pricing for Guteneo runtime, preparation processes, environments, and possible workspace installations. [Document Security LTS offerings](https://experienceleague.adobe.com/en/docs/experience-manager-65-lts/content/forms/use-document-security/document-security-offerings).

General terms end usage rights and require software removal when the license ends. Continued access to old PDFs therefore needs negotiated terms. They also restrict some sensitive personal-data processing in cloud services without written agreement: have personal financial data reviewed specifically, without treating all corporate financial documents as that category. [General terms §13.3 and §6.3(C)](https://www.adobe.com/fr/cc-shared/assets/pdf/legal/terms/enterprise/generalterms-fr-2025v1.pdf).

The Forms sales page requests a quotation and provides no unit DRM/OEM price. Prices for another Adobe product cannot be converted into an AEM Document Security estimate. [Adobe Forms pricing](https://business.adobe.com/products/experience-manager/forms/pricing.html).

## 3. FileOpen: negotiate an OEM agreement

### Published findings

The FAQ does not permit reselling encryption through one instance of a standard product; it provides negotiated OEM/VAR agreements instead. Pricing factors include administrators, recipients, documents, and authentications. Some one-to-many publishing uses avoid per-seat charges, while enterprise uses may incur them. Annual support covers the licensed team, not its recipients; a response within one business day is advertised, but no public recovery-time commitment was established. [Official FAQ](https://www.fileopen.com/subscription-plans).

The Enterprise offer advertises unlimited end users. This does not define an OEM license, unlimited workspaces, or unlimited requests. Confidential documents belonging to several customers are not automatically equivalent to a publisher distributing its own catalog. [FileOpen plans](https://www.fileopen.com/subscription-plans).

The partner page confirms OEM/VAR routes and library/API integration. It does not itself authorize white labeling, client redistribution, or processing third-party documents for Guteneo. [Partnerships](https://www.fileopen.com/partnering-opportunities).

### Requested offer

Request a **portable PDF engine under an OEM agreement**, with the appropriate permission server, required clients, and audit interfaces. Price Browser UX as a separate option: a web-reader-only quotation does not meet the requirement for protection after download.

The site historically distinguished RightsManager, RightsServer, and Developer Toolkit, but several old product links now redirect to general pages. Do not treat them as current orderable SKUs or automatically equate them with Basic/Pro/Enterprise. [Published product families](https://www.fileopen.com/document-security-drm-products).

Technical pages describe Windows/Linux modules and a customizable permission server; SDK/interfaces support integration into existing applications. **Inference for Guteneo:** this modularity supports investigating Workers for permissions and a Linux Container for encryption, subject to protocol, support, CPU architecture, and runtime licensing. Cloudflare-specific support has not been established. [Components](https://www.fileopen.com/system-components), [development](https://www.fileopen.com/developers).

Clarify whether pricing is per process, server, container, region, or deployment; whether restarts/autoscaling consume licenses; and whether the runtime key supports ephemeral instances. These are contractual and technical questions, not vendor-announced costs.

### Recipients, data, and exit

Clients are free, but the service provider's license is not therefore free. The licensee can manage identity without FileOpen-issued accounts. A Guteneo guest's exact plugin journey still needs testing. [Clients](https://plugin.fileopen.com/all.aspx), [identity architecture](https://www.fileopen.com/technology-overview).

The public PDF client agreement is revised **25 October 2005**. It is not the publisher/OEM agreement; a recent indexing date does not modernize it. Obtain terms applicable to the binaries actually distributed. [Client EULA](https://www.fileopen.com/hubfs/docs/fileopenclientlicense.pdf).

The public privacy policy is dated **25 May 2018**, describes US processing, and still references Privacy Shield. It distinguishes data sent to the licensee's server from some FileOpen telemetry. Alone, it is not a current EU processing assessment for Guteneo. Request the DPA, transfers, subprocessors, telemetry, support, backups, and retention for the selected variant. [Published policy](https://www.fileopen.com/privacy-and-cookie-policy).

No annual minimum, OEM price grid, overage schedule, or complete post-termination continuity commitment was found in the official sources reviewed. Comparison-site Basic prices cannot establish Guteneo's budget. Sharebot terms concern a different service and must not be applied to the SDK. [Separate Sharebot offer](https://www.fileopen.com/sharebot_terms_of_service).

## 4. Define counters before comparing prices

These are quotation requirements, not rights already granted.

| Counter | Question requiring a written answer | Risk without clarification |
| --- | --- | --- |
| Workspace | Legal entity, technical tenant, domain, subsidiary, or contract? | One shared plan becomes one contract/license per customer |
| Sender | Guteneo operator, workspace administrator, or anyone protecting through the API? | Indirect seats are underestimated |
| Recipient | Invited person, available document, activated account, or first opening? | License consumption before actual use |
| Period | Concurrent readers, monthly active users, annual unique users, named population, or contract lifetime? | Invisible accumulation of occasional guests |
| Reassignment | Does document expiry, inactivity, or workspace departure release a license? | Permanent cost for one-time reading |
| Deduplication | Same person across workspaces, addresses, or devices? | Duplicate billing or excessive shared-directory data |
| Deployment | Cluster, region, environment, instance, or group of workspaces? | Second license for the same recipient |
| Document | Source, version, encrypted result, watermarked variant, or assignment? | Three recipients create three billable units |
| Request | Authentication, license, printing, audit, administration, failure, or retry? | One opening consumes several operations |
| Active stock | Retained PDFs, valid licenses, or readable history? | Costs persist years after initial delivery |
| Throughput | Protections/minute, authentications/second, and concurrent readers? | Monthly volume is compliant while service is saturated |

For either vendor, commercial counting must not expose a person's presence or activity across workspaces. An email address is not always one person: aliases, shared mailboxes, and address changes require workable contractual rules. Do not build a cross-workspace directory solely to reduce the bill.

## 5. Three deployment arrangements to price

| Arrangement | Value for Guteneo | Limits to address |
| --- | --- | --- |
| **Shared OEM license** | One engine agreement, logical workspace isolation, shared fixed costs | Explicit permission, aggregate metrics, isolation, workspace growth, negotiated quotas |
| **Dedicated deployment per workspace** | Suitable for isolation requirements or individual contracts | Repeated fixed, acceptance, recovery, and operating costs; service-provider rights remain necessary |
| **Bring your own license (BYOL)** | Guteneo bills connector/service; the enterprise funds its engine | Guteneo operating/hosting rights, API/external-recipient rights, maintenance of multiple environments |

BYOL is a possible enterprise offer, not permission to share a standard license. Separate workspace installations may multiply person/deployment pairs when several workspaces send to the same firm or partner.

**Proposed request:** shared and dedicated FileOpen OEM quotations; Adobe self-hosted/OEM, Managed Services, and customer-licensed options. If a route is unavailable, request an explicit answer instead of silent substitution with another product.

## 6. Identical scenarios for both vendors

Comparison assumptions only, not measured Guteneo traffic. Each source has 10 pages, 3 recipients, and 2 openings per assignment. Distinguish two senders per workspace and two central operators.

| Variable | Pilot | Growth | Scale |
| --- | ---: | ---: | ---: |
| Workspaces | 10 | 100 | 1,000 |
| New PDF sources/month | 1,000 | 10,000 | 100,000 |
| Document-recipient assignments/month | 3,000 | 30,000 | 300,000 |
| Distinct active people/month | 500 | 5,000 | 50,000 |
| Net new people/month after M1 | 100 | 1,000 | 10,000 |
| Openings/month | 6,000 | 60,000 | 600,000 |
| Workspace senders | 20 | 200 | 2,000 |
| Guteneo operators | 2 | 2 | 2 |
| People encountered by M12 | 1,600 | 16,000 | 160,000 |
| People encountered by M36 | 4,000 | 40,000 | 400,000 |

The final two rows calculate `M1 people + (months - 1) × new people`, without reassignment. They do not claim those totals will be billed: they test the risk of a growing named population. New people are new to the entire deployment, not merely absent in the previous month.

Request two prices per scenario:

- **Short access:** access expires after 30 days; protected PDFs/policies are removed through a defined procedure, with a separate log policy. The vendor must state whether this releases licensed units.
- **Long access:** access remains for 36 months. Growth could retain up to 360,000 protected sources after 36 months, or 1,080,000 artifacts with per-recipient customization. Later openings must be added to new-publication openings using an explicit assumption.

Stress variants: 25% recipient overlap between workspaces; twice as many new people; three times as many openings with the same population; 10% technical failures/retries; a second region; and parallel operation during migration. Change only the relevant counters in each variant to understand its cost.

These scenarios support an initial license quotation. Infrastructure costing also needs average/maximum PDF size, log retention, events per opening, and peak throughput. These are not yet measured; quotations must state assumptions instead of treating them as zero.

## 7. Total cost model

### Required inputs: do not replace unknowns with zero

| Cost item | Quotation requirements |
| --- | --- |
| SaaS/OEM rights | Price, minimum, included workspaces, annual/multi-year term, possible revenue royalty |
| Base product | Required SKUs/functions; separate base from DRM module |
| Recipients/seats | Unit, period, inclusions, reassignment, proration, increases/decreases |
| Production/recovery | Runtime, instances, regions, warm/cold standby licenses, failover |
| Development/acceptance | Evaluation, CI, staging, restore-test rights, permitted data |
| API/SDK/PPL | Required modules, processes, runtime limits, redistribution rights |
| Variable usage | Documents, versions, artifacts, authentications, audit, storage, overages |
| Vendor support | Hours, urgency, response/recovery commitments, reader responsibility |
| Installation/integration | Mandatory services, training, assistance, validation, fixed fees |
| Exit | Read-only mode, license-server continuity, export, migration, parallel operation |

Add Guteneo's costs: supported hosting, database/backups, operations/patching, reader testing, Cloudflare, email/identity, security, and workspace/recipient support. Self-hosting may reduce vendor fees while transferring these costs to Guteneo.

```text
Annual license = contractual fixed fee
               + sum(max(0, billable units - included allowance) × overage rate)

36-month TCO = integration + commissioning + initial fees
             + recurring and variable costs over 36 months
             + migration and exit

Recipient support cost = incidents × average hours × loaded hourly cost
```

Adapt the first formula to the quotation: a guaranteed minimum may already include the fixed fee or act as usage credit. Do not count the same commitment twice. Separate prepaid annual charges, one-time fees, monthly costs, and usage reconciliations.

Calculate overages over the applicable contractual period. Unused monthly allowance cannot offset another month without explicit rollover. Assign each cost once; included support, Managed Services hosting, SDK/runtime, or professional services must not be added again.

Compare **year-one cash requirements**, **recurring cost at steady load**, and **36-month TCO**. Also calculate cost per workspace, publication, new recipient, opening, and retention month. Already-paid Guteneo costs must not hide long-term total cost: present incremental and total costs separately.

### A budget ceiling before quotations

Illustrative example: 100 workspaces, a hypothetical DRM surcharge, and an 80% target gross margin. These are neither decided Guteneo prices nor estimated vendor prices.

| Hypothetical surcharge/workspace/month, excluding tax | Annual revenue | Maximum annual direct-cost budget |
| --- | ---: | ---: |
| €50 | €60,000 | €12,000 |
| €100 | €120,000 | €24,000 |
| €250 | €300,000 | €60,000 |

`Direct-cost budget = additional revenue × (1 - target margin)`.

`License ceiling = direct-cost budget - infrastructure - operations/support - other direct costs`.

In the middle scenario, **€24,000/year is the ceiling for all direct costs**, not the license alone. Development costs and initial cash requirements still need separate assessment under the chosen profitability policy.

If a contract billed the entire encountered population annually, that ceiling would allow at most €1.50/person/year for 16,000 people, then €0.60 for 40,000, before other costs. This sensitivity does not describe Adobe pricing: it shows why inactive-recipient definitions can determine SaaS viability.

These ratios apply year-end capacity to a whole year without proration. If the contract prorates, recalculate using billed person-months; these are not observed average costs.

For usage-based Guteneo billing, repeat the calculation using actually billed units: document, recipient, hosting period, or workspace. Do not automatically carry historical protected-link pricing into a DRM offer.

## 8. Clauses to negotiate before commitment

| Topic | Proposed Guteneo position |
| --- | --- |
| SaaS scope | Explicit permission to protect independent workspaces' documents and charge for the service |
| Shared operation | One master agreement; workspace growth without automatic relicensing at every signup |
| Occasional recipients | Defined release/reassignment, or capacity allowance with capped overages |
| Counting | Written rules for aliases, shared mailboxes, shared recipients, versions, refusals, retries |
| Price | Minimum, inclusions, overages, currency, tax, indexation, renewal-increase ceiling |
| Commitment | Authorized trial, acceptance criteria, scaling, and possible volume reduction |
| Non-production/recovery | Named environments, failover, and restore rights without unexpected licenses |
| Cloudflare runtime | Explicitly permitted/supported architecture, ephemeral containers, regions, autoscaling |
| Support | Guteneo/vendor responsibility, security/Reader fixes, emergency hours, recovery service |
| Processing | Actual transmitted data, regions, remote support, telemetry, DPA, deletion |
| Exit | Policy/log export, license-domain continuity, old-file reading rights, transition period |
| License verification | Verifiable/auditable metrics without exposing content, recipients, or cross-workspace activity |

An API's technical capability does not establish contractual permission. Request the document granting the right and its limits. An unlimited claim must identify exactly what will not be billed.

## 9. Quotation brief prepared for possible use

Preparation only; **nothing was sent**. This brief predates the subsequent decision at the top of this document.

> Guteneo would like to integrate persistent PDF protection into its SaaS. Independent business customers use the platform to protect their own confidential documents and distribute them to external recipients. Guteneo charges for this feature. Data, identities, policies, and logs are workspace-isolated; some recipients may be shared without cross-workspace visibility.
>
> The offer must cover downloaded PDFs opened in a compatible reader, plus preparation, permission, revocation, and audit APIs. A web-reader-only solution is not equivalent. We want to keep the application on Cloudflare and qualify any required native components, their hosting, and their licenses.
>
> Please quote the Pilot, Growth, and Scale scenarios in section 6, separating years one, two, and three, one-time costs, minimums, and overages. Confirm availability of a shared OEM/service-provider agreement and separately propose dedicated or customer-licensed variants. Identify incompatibilities with this model before suggesting a substitute product.

Expected response from each vendor:

1. **Yes/no with contractual reference** for multi-workspace SaaS, third-party document processing, and service billing.
2. Product/SKU references, supported version, base, modules, clients, and included options.
3. Billable-unit definitions from section 4, including occasional recipients and API use.
4. Prices for three scenarios and two access durations, minimums, overages, annual increases, and payment terms.
5. Acceptance, production, recovery, migration, and autoscaling capacities/costs.
6. Workspace/recipient support responsibilities, license-service availability, and fix timelines.
7. DPA, regions, transmitted data, and isolation commitments for the proposed variant.
8. Operation/cost after stopping new protection or terminating: old-file opening/revocation, export, transition.
9. Synthetic-document trial terms: price, duration, test rights, no unauthorized automatic sends, and validation criteria.

Do not include customer documents, real recipient lists, or secrets in the brief. Agreed terms must be incorporated into the final contract; a vague sales response is insufficient.

## 10. Proposed evaluation after quotations

Reject offers that do not explicitly cover the requested SaaS, have unpredictable billing units, or prevent honoring workspace commitments on exit without a transition solution.

Then compare:

1. Total costs and cash requirements, with sensitivity to new recipients and old documents.
2. External-recipient journeys and support burden.
3. Available audit data, latency, and revocation measured by a prototype.
4. Cloudflare hosting/support or an accepted external-component cost.
5. Continuity, security, portability, and contractual commitments.

**Historical commercial priority: FileOpen OEM, retaining Adobe technical comparison and quotations.** Adobe could fit a workspace-funded enterprise offer or a favorable negotiated SaaS contract. FileOpen could better fit an integrated platform, subject to permission and price. Neither vendor was selected for implementation; the later in-house decision is recorded at the top of this document.
