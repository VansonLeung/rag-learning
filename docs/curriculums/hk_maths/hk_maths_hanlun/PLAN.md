Reviewed on 2026-09-13 for Grove's personal learning and experimentation use case.

Recommendation: add Hanlun as a linked learning resource first. Build independently authored exercises in Grove. Prepare a source-specific importer as a future option if permission covering the intended copying, processing, and storage is established.

The supplied SOURCE.md is the input to this review. At the time of the initial review, no corpus import, site mirror, or application implementation had been performed. The observations below come from a small inspection of the supplied pages, the selected module index, its two simulator documents, the shared loader, and the site's published notice. The remaining modules have not been inspected. The implementation update at the end records the subsequent pilot.

| Evidence                                                                                 | Observation                                                                                                                                       | Design consequence                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [Maths directory](https://www.hanlunelr.com/content/repository/toc-maths.html)           | Its HTML links to 54 distinct maths module directories and represents prerequisite relationships.                                                 | Use explicit directory links for discovery; preserve prerequisites separately from folders.             |
| [Selected module](https://www.hanlunelr.com/content/Maths_Shirley_M23/index.html)        | The function-graphs module has learning objectives and five linked sections: `lesson_1a`, `lesson_1b`, `lesson_1c`, `lesson_2a`, and `lesson_3a`. | Module, lesson, and section should remain distinct identifiers.                                         |
| [First sample](https://www.hanlunelr.com/content/Maths_Shirley_M23/lesson_1a.html)       | Explanatory content includes LaTeX in the original HTML.                                                                                          | Extract the original mathematical notation before browser typesetting.                                  |
| [Interactive sample](https://www.hanlunelr.com/content/Maths_Shirley_M23/lesson_1b.html) | One matching activity has ten dropdown parts with explicit answer attributes. Two iframe documents provide graph activities.                      | A text-only importer would lose both assessment structure and interactive context.                      |
| [Shared loader](https://www.hanlunelr.com/content/shared/js/hil_main.js)                 | The loader conditionally loads MathJax and an activity utility; lesson scripts also reference JSXGraph.                                           | Direct script tags alone do not describe all runtime dependencies.                                      |
| [Published notice](https://www.hanlunelr.com/content/repository/copyright.html)          | The notice limits use to private study/reference, excludes commercial benefit, and states: “No further copying or transfer is permitted.”         | Public HTTP access and personal use do not establish permission to mirror or redistribute the material. |

A request for `/robots.txt` returned HTTP 404 during this review. That does not establish reuse permission. A fresh browser navigation redirected to the published notice; no agreement was accepted or browser storage modified to bypass it. Consequently, interaction behaviour was not verified end to end. The assessment structure and simulator relationships above were observed in source HTML, not established by a successful learner session.

That fresh-session check also reported missing MathJax and three missing JSXGraph container elements during navigation. These are inspection observations, not a verdict on behaviour after the site's agreement flow. A future authorised runtime check should distinguish agreement-dependent loading from unused or broken lesson scripts.

The source is promising because it already models modules, prerequisites, objectives, and interactive learning. Its organisation should inform Grove's subject-package design. However, adopting an entire legacy website as executable application content would introduce substantial dependencies and make exercise state and marking difficult to integrate.

| Approach                                                                       | Suitability now                                  | Limits                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Curated links with our own short descriptions and topic mappings               | Recommended first step                           | Learners use Hanlun in the original site; availability remains external.                                                            |
| Request an authorised structured export or offline package                     | Preferred route to a faithful import             | No such export was established by this review; availability and permission must be confirmed with the publisher.                    |
| Independently authored Grove exercises covering the same mathematical concepts | Recommended parallel development                 | Author original wording, options, diagrams, and checking logic; do not package extracted Hanlun content as newly authored material. |
| Source-specific content importer                                               | Technically plausible, conditional on permission | Requires mathematical review and explicit conversion of supported activities.                                                       |
| Full site mirror or direct execution of imported JavaScript in Grove           | Poor initial fit                                 | Does not by itself provide structured records, reliable offline behaviour, or native attempts and feedback.                         |

For the reference-only version, store a `linked_resource` record with a stable local ID, canonical URL, source module ID, an independently written short description, manually reviewed curriculum links, and verification date. Record the original-site notice URL and a reuse state such as `reference_only`. Use those authored descriptions for discovery; do not index downloaded lesson bodies under this mode. A link record should never be presented as evidence that the app has retrieved and verified the remote lesson's contents.

Keep two identities: Hanlun's module ID and the HK curriculum unit/objective IDs. A publisher module can span several curriculum objectives. Mapping function graphs to the existing `CP02` unit is a candidate mapping, not a verified classification for every activity in the module. Do not label all linked content as core or current solely from its directory placement.

Selecting a linked activity should open the original source through Grove's external-link flow. This also leaves the site's own notice and interaction in their original context. Native attempt tracking applies to Grove exercises; the app should not claim it can read completion or scores from an unrelated external page.

For custom Grove views, implement an independently authored `function_graph_matching` exercise as a useful pilot. This is a separate track from the earlier JS08 linear-equation pilot: it tests a richer view involving plots and multiple answer fields. Its definition should reference a supported plot component, use stable choice IDs, identify mathematical domains and plotting windows separately, and provide explicit checking rules. The renderer should consume validated data rather than arbitrary JavaScript expressions.

If permission for ingestion becomes available, the proposed importer should work in these stages:

1. **Inventory.** Read the maths directory and follow its explicit module links. Within each module, discover section links from its index. Classify prerequisites as relationships rather than recursively treating every link as another document to crawl. Do not guess lesson filenames. Normalise trailing-slash/index aliases and use fragments as section locators rather than duplicate pages.
2. **Bounded acquisition.** Start with only the supplied module and the two inspected lesson pages. Allowlist the source host, selected lesson paths, and required assets. Follow iframe documents as separately typed dependencies. Check redirect destinations. Use one request at a time, at least a one-second gap, finite retries with backoff, response-size limits, and a configured page/byte budget. Stop on authentication gates, access denials, or rate-limit responses. Recheck applicable source rules before a later run.
3. **Snapshot.** Where authorised, retain immutable original bytes, MIME type, canonical/final URL, fetch time, content hash, and available ETag/Last-Modified headers. Keep an asset/dependency manifest. Preserve the source notice and the scope of any permission alongside the snapshot.
4. **Parse static structure.** Extract lesson content rather than headers, menus, footers, or scripts. Preserve LaTeX, tables with row/column spans, captions, and links to diagrams or activities. Use an HTML parser; malformed legacy HTML makes regular expressions unsuitable as the production parser.
5. **Convert known activity types.** Extract the matching activity into a prompt, stable parts and choices, and a separate answer-key record. Treat iframe simulations as `interactive_demo` unless a task and success criterion are explicitly known. Unsupported interactions remain linked resources with a visible conversion status.
6. **Inspect runtime selectively.** Use browser rendering to investigate behaviours that static extraction cannot establish, after applicable access requirements have been resolved. Capture browser errors and dependency failures. Do not fake the site's agreement flag, execute source code in Grove's origin, or interpret a screenshot as a complete exercise specification.
7. **Review and map.** Validate formulas, domains, curriculum mapping, assessment keys, and source locators. Store corrections as reviewed annotations or new authored records while preserving the original source snapshot. Imported material starts as unreviewed.
8. **Package and import.** Produce versioned records and profiles, perform a dry-run import, then commit validated records. Preserve stable source identities across updates; record removals or changed activities rather than silently overwriting learner history.

Discovery of shared scripts should produce a dependency inventory before any offline replay is attempted. Embedded assets and dynamically loaded utilities need their own licensing and technical review. Local archival capability and native conversion are separate deliverables; neither should be assumed from successful HTML downloads.

The proposed record model extends the existing maths design with:

| Record              | Essential information                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| `linked_resource`   | Original URL, authored description, topic links, verification status             |
| `source_module`     | Publisher identity, source module ID, objectives, prerequisite IDs               |
| `lesson_section`    | Module/lesson IDs, section locator, content revision, mathematical content       |
| `exercise`          | Prompt, part IDs, answer type, option IDs, view reference, solution references   |
| `answer_key`        | Exercise revision, correct response specification, checker type, review evidence |
| `interactive_demo`  | Activity purpose, original URL, supported native equivalent if any               |
| `source_annotation` | Issue, source location, reviewer, correction or unresolved question              |
| `attempt`           | Exercise revision, learner response, submitted time, check result, hints used    |

These are design types, not types already supported by Grove. The implementation should retain a common core schema and versioned subject extensions. Put source-specific selectors and conversions in a Hanlun adapter rather than hardcoding them into the general retrieval service.

Retrieval must distinguish purposes. Explanations retrieve reviewed teaching records; practice discovery retrieves question metadata without answer keys; checking and solution reveal load the linked key explicitly. Parent expansion and citation previews must honour the same separation. Historical attempts should retain the exercise revision they answered.

Keep mathematical expressions separate from plotting configuration: a viewport is not necessarily the function's domain. A plot must not imply continuity through excluded points or asymptotes. Review source language concerning extrema and periods before using it for marking; do not treat the presence of source text or an answer attribute as proof of mathematical correctness.

Candidate export structure, with content inclusion determined by the package's documented permissions:

```text
hanlun-subject-package/
  manifest.json
  source-notices/
  schemas/
  profiles/
  curriculum-mappings.jsonl
  links.jsonl
  modules.jsonl
  records.jsonl
  relationships.jsonl
  views/
  checks/
  raw/                     # only when copying/storage is authorised
  assets/                  # only assets covered by the applicable permissions
  indexes/                 # optional compatible cache of permitted content
```

In reference-only mode, packages contain authored metadata and links, without copied lesson bodies, answer keys, source JavaScript, or source-derived vector caches. Exporting a subtree must carry the effective profile and identify external prerequisites. Credentials and learner attempts are excluded by default. A package must not claim that its linked activities work offline.

Before broadening an authorised import, require these pilot checks:

- Stable module and lesson identities on repeated discovery.
- Preservation of mathematical notation and section-level provenance.
- Correct association between exercise parts, options, and answer keys.
- No answers exposed through practice retrieval, parent expansion, or source previews.
- Clear separation of a demo from a marked exercise.
- Native graph behaviour checked at domain boundaries and discontinuities.
- An unsupported interaction remains usable as an external link.
- Export/re-import preserves references and reports missing dependencies.
- Unchanged snapshots are skipped; changed source records receive new revisions.

The next implementable increment is a linked-resource record and a native, independently authored graph exercise view. A broader Hanlun crawl should wait for an established reuse basis; if that is unavailable, Grove can still use the site as an external learning companion.

Implementation update, 2026-09-13: the first increment is available through **Practice** in Grove's top bar. It includes four curated linked-resource records, provisional CP02 mappings, and an independently authored graph-matching template with a native SVG view and coordinate sliders. Draft answers and checked attempts persist in each workspace database. The drawer supports full-window and mobile layouts. Private answer keys are returned as feedback only after submission and remain outside document retrieval.

The pilot is workspace-wide built-in practice; it does not claim to generate questions from the selected document folder. The definitions identify their template revision and view type, but editable subject profiles, additional custom view types, and package import/export remain future work. No Hanlun lesson text, answer keys, or executable assets are included in the pilot, and no crawler was implemented.
