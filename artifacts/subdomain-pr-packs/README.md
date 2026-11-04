# Subdomain pull-request preparation packs

Local drafts only. No domain availability, deployment, maintainer approval or registration is claimed. No PR has been opened by this pack. Only the public GitHub handle and GitHub Pages target are included, with no personal contact details.

## is-a.dev

Copy the two JSON files into `domains/` in a current checkout of `is-a-dev/register`. They request `stepcheck.is-a.dev` and `taaltrainer.is-a.dev` with the supplied owner handle and CNAME. Check current documentation at https://docs.is-a.dev and the upstream schema before opening separate PRs. If a newly mandatory owner/contact field is missing, obtain a user-approved public contact method rather than adding a personal email.

## JS.ORG

`js-org/cnames_active_patch.diff` is a draft insertion into the `cnames_active.js` object in `js-org/js.org`, proposing `stepcheck.js.org` and `taaltrainer.js.org`. Run `git apply --check` in the current upstream checkout, then apply and sort the entries into the project's required alphabetical order. The header context can change; rebuild the diff against the current file if necessary. The `// noCF` comments request unproxied DNS; confirm the current DNS convention with upstream. These are JavaScript projects, but eligibility and acceptance remain the maintainers' decisions. Read https://js.org before filing.

## Deployment gates

The requested CNAME points to a host, not `/stepcheck/` or `/taaltrainer/`. GitHub Pages custom domains require the matching deployed site's `CNAME` file and account/domain verification; the same site cannot simply bind all four names as independent project domains. Select which service/name to pursue for each project and verify the chosen Pages configuration before filing. Do not publish simultaneous competing requests or assume a CNAME creates path routing. Test each proposed hostname for the intended working project content after approval and DNS propagation. An approved subdomain is not a paid domain prize.
