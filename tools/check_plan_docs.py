#!/usr/bin/env python3
"""Consistency checker for the ParcelTrack Lite planning documents.

Documentation tooling only (no application code). Checks, over docs/ and README.md:

* relative Markdown links and heading anchors resolve;
* every phase file has the 12 required sections in order and contiguous task / test IDs;
* every referenced task, test case, handoff, temporary substitute, decision, external
  dependency, gate and integration scenario is defined;
* handoff register: producer owns the delivering task, no consumer phase precedes the
  producer phase unless a substitute is listed;
* worksheet rows (M1-01.., S-01.., RLS-01..), feature IDs and endpoint IDs are traced;
* the generated test-case index in each module test-plan.md is current.

Usage:
    python tools/check_plan_docs.py            # check only (exit 1 on any error)
    python tools/check_plan_docs.py --write-index   # regenerate test-plan indexes first
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
MODULES = {
    "M1": ("module-1-auth", "Naszrul"),
    "M2": ("module-2-parcels", "Zikri"),
    "M3": ("module-3-delivery", "Syauqi"),
}
PHASE_FILES = {
    1: "PH1-foundation.md",
    2: "PH2-checkpoint-slice.md",
    3: "PH3-complete-functionality.md",
    4: "PH4-hardening-regression.md",
    5: "PH5-aws-operations.md",
    6: "PH6-final-acceptance.md",
}
SECTIONS = [
    "1 Objective", "2 Entry criteria", "3 Dependencies", "4 Ordered tasks",
    "5 Affected components", "6 Security requirements", "7 Tests",
    "8 Deliverables and handoffs", "9 Exit criteria", "10 Integration checkpoint",
    "11 Failure risks and recovery", "12 Deferred work",
]
WORKSHEET = (
    [f"M1-{i:02d}" for i in range(1, 13)]
    + [f"M2-{i:02d}" for i in range(1, 11)]
    + [f"M3-{i:02d}" for i in range(1, 11)]
    + [f"S-{i:02d}" for i in range(1, 10)]
    + [f"RLS-{i:02d}" for i in range(1, 11)]
)
FEATURES = (
    [f"M1-F{i:02d}" for i in range(1, 6)]
    + [f"M2-F{i:02d}" for i in range(1, 5)]
    + [f"M3-F{i:02d}" for i in range(1, 6)]
)
ENDPOINTS = [f"A{i:02d}" for i in range(1, 21)]

errors: list[str] = []
warnings: list[str] = []


def err(path: Path, line: int, msg: str) -> None:
    errors.append(f"{path.relative_to(ROOT)}:{line}: {msg}")


def warn(path: Path, line: int, msg: str) -> None:
    warnings.append(f"{path.relative_to(ROOT)}:{line}: {msg}")


def md_files() -> list[Path]:
    files = sorted(DOCS.rglob("*.md"))
    files.append(ROOT / "README.md")
    return files


def slug(heading: str) -> str:
    h = heading.strip().lower()
    h = re.sub(r"`", "", h)
    h = re.sub(r"[^\w\- ]", "", h, flags=re.UNICODE)
    return h.replace(" ", "-")


def headings(path: Path) -> set[str]:
    out: set[str] = set()
    seen: dict[str, int] = {}
    in_fence = False
    for raw in path.read_text(encoding="utf8").splitlines():
        if raw.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", raw)
        if m:
            s = slug(m.group(2))
            n = seen.get(s, 0)
            seen[s] = n + 1
            out.add(s if n == 0 else f"{s}-{n}")
    return out


# ---------------------------------------------------------------- links
def check_links(files: list[Path]) -> None:
    cache: dict[Path, set[str]] = {}
    link_re = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
    for f in files:
        in_fence = False
        for i, raw in enumerate(f.read_text(encoding="utf8").splitlines(), 1):
            if raw.startswith("```"):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            for m in link_re.finditer(raw):
                target = m.group(1)
                if re.match(r"^[a-z]+://", target) or target.startswith("mailto:"):
                    continue
                path_part, _, anchor = target.partition("#")
                dest = f if path_part == "" else (f.parent / path_part).resolve()
                if not dest.exists():
                    err(f, i, f"broken link: {target}")
                    continue
                if anchor and dest.suffix == ".md":
                    if dest not in cache:
                        cache[dest] = headings(dest)
                    if anchor not in cache[dest]:
                        err(f, i, f"missing anchor '#{anchor}' in {dest.relative_to(ROOT)}")


def check_fences(files: list[Path]) -> None:
    for f in files:
        n = sum(1 for ln in f.read_text(encoding="utf8").splitlines() if ln.startswith("```"))
        if n % 2:
            err(f, 1, "unbalanced code fences")


# ---------------------------------------------------------------- phase files
def phase_path(m: str, p: int) -> Path:
    return DOCS / "modules" / MODULES[m][0] / "phases" / PHASE_FILES[p]


def split_row(line: str) -> list[str]:
    # split on unescaped pipes
    parts = re.split(r"(?<!\\)\|", line.strip())
    return [c.strip() for c in parts[1:-1]]


def parse_phase_files():
    tasks: dict[str, dict] = {}
    tcs: dict[str, dict] = {}
    for m, (folder, owner) in MODULES.items():
        for p, name in PHASE_FILES.items():
            path = phase_path(m, p)
            if not path.exists():
                err(DOCS / "modules", 1, f"missing phase file {path.relative_to(ROOT)}")
                continue
            lines = path.read_text(encoding="utf8").splitlines()
            # header
            if not lines or not lines[0].startswith(f"# {m} PH{p}"):
                err(path, 1, f"title must start with '# {m} PH{p}'")
            if not any(l.startswith(f"Owner: {owner}") for l in lines[:6]):
                err(path, 3, f"Owner line must name {owner}")
            # sections
            found = [l[3:].strip() for l in lines if l.startswith("## ")]
            if found != SECTIONS:
                err(path, 1, f"sections must be exactly {SECTIONS}; found {found}")
            tnums, cnums = [], []
            for i, l in enumerate(lines, 1):
                mt = re.match(rf"^\| ({m}-PH{p}-T(\d\d))( \(CP\))? \|", l)
                if mt:
                    cols = split_row(l)
                    if len(cols) != 5:
                        err(path, i, f"task row needs 5 columns, has {len(cols)}")
                    tasks[mt.group(1)] = {"path": path, "line": i, "cp": bool(mt.group(3)), "text": l}
                    tnums.append(int(mt.group(2)))
                mc = re.match(rf"^\| ({m}-PH{p}-TC(\d\d)) \|", l)
                if mc:
                    cols = split_row(l)
                    if len(cols) != 5:
                        err(path, i, f"test row needs 5 columns, has {len(cols)}")
                    tcs[mc.group(1)] = {"path": path, "line": i, "cols": cols, "phase": p, "module": m}
                    cnums.append(int(mc.group(2)))
                # foreign IDs defined in this file
                for fid in re.findall(r"^\| (M\d-PH\d-T(?:C)?\d\d)", l):
                    if not fid.startswith(f"{m}-PH{p}-"):
                        err(path, i, f"row ID {fid} does not belong to {m}-PH{p}")
            if tnums != list(range(1, len(tnums) + 1)):
                err(path, 1, f"task IDs not contiguous from T01: {tnums}")
            if cnums != list(range(1, len(cnums) + 1)):
                err(path, 1, f"test IDs not contiguous from TC01: {cnums}")
            if not tnums:
                err(path, 1, "no tasks defined")
            if not cnums:
                err(path, 1, "no tests defined")
    return tasks, tcs


# ---------------------------------------------------------------- registers
def parse_register_ids(path: Path, pattern: str) -> set[str]:
    return set(re.findall(pattern, path.read_text(encoding="utf8"), flags=re.M))


def expand_ids(text: str) -> list[tuple[str, int]]:
    """Return (id, offset) for full IDs, short TCnn/Tnn tokens (inheriting the
    latest full prefix on the same line) and 'a to b' / 'a-b' ranges."""
    out: list[tuple[str, int]] = []
    for ln_off, line in enumerate(text.splitlines()):
        prefix = None
        # tokenise
        tok = re.compile(r"(M\d-PH\d)-(TC|T)(\d\d)|(?<![\w-])(TC|T)(\d\d)(?![\w-])")
        last_kind = None
        last_num = None
        pos = 0
        items = []
        for m in tok.finditer(line):
            if m.group(1):
                prefix = m.group(1)
                kind, num = m.group(2), int(m.group(3))
            else:
                if prefix is None:
                    continue
                kind, num = m.group(4), int(m.group(5))
            items.append((m.start(), m.end(), prefix, kind, num))
        for idx, (s, e, pf, kind, num) in enumerate(items):
            out.append((f"{pf}-{kind}{num:02d}", ln_off))
            # range with previous token: "X to Y" or "X-Y" between consecutive tokens
            if idx > 0:
                ps, pe, ppf, pkind, pnum = items[idx - 1]
                between = line[pe:s]
                if re.fullmatch(r"\s*(to|-)\s*", between) and ppf == pf and pkind == kind:
                    for k in range(pnum + 1, num):
                        out.append((f"{pf}-{kind}{k:02d}", ln_off))
    return out


def check_references(files, tasks, tcs, handoffs, tmps, decisions, exts, ints) -> None:
    defined = set(tasks) | set(tcs)
    for f in files:
        text = f.read_text(encoding="utf8")
        lines = text.splitlines()
        in_fence = False
        for i, raw in enumerate(lines, 1):
            if raw.startswith("```"):
                in_fence = not in_fence
            # tasks / tests (full or inherited short)
            for rid, _ in expand_ids(raw):
                if rid not in defined:
                    err(f, i, f"undefined task/test reference {rid}")
            for h in re.findall(r"(?<![\w-])H(\d\d)(?![\w-])", raw):
                if f"H{h}" not in handoffs:
                    err(f, i, f"undefined handoff H{h}")
            for t in re.findall(r"TMP-(\d\d)", raw):
                if f"TMP-{t}" not in tmps:
                    err(f, i, f"undefined substitute TMP-{t}")
            for d in re.findall(r"(?<![\w-])D-(\d\d)(?![\w-])", raw):
                if f"D-{d}" not in decisions:
                    err(f, i, f"undefined decision D-{d}")
            for x in re.findall(r"EXT-(\d\d)", raw):
                if f"EXT-{x}" not in exts:
                    err(f, i, f"undefined external dependency EXT-{x}")
            for n in re.findall(r"INT-(CP-\d\d|\d\d)", raw):
                if f"INT-{n}" not in ints:
                    err(f, i, f"undefined integration scenario INT-{n}")
            for g in re.findall(r"(?<![\w-])G([0-9]+)(?![\w.-])", raw):
                if int(g) not in range(1, 7):
                    err(f, i, f"undefined gate G{g}")


def check_short_ids_in_phase_files(tasks, tcs) -> None:
    """Inside a phase file, a bare Tnn / TCnn with no full ID before it on the same
    line must exist in that file (tokens after a full ID inherit its prefix and are
    validated by check_references instead)."""
    tok = re.compile(r"(M\d-PH\d)-(?:TC|T)\d\d|(?<![\w-])(TC|T)(\d\d)(?![\w-])")
    for m in MODULES:
        for p in PHASE_FILES:
            path = phase_path(m, p)
            if not path.exists():
                continue
            ids = {k for k in list(tasks) + list(tcs) if k.startswith(f"{m}-PH{p}-")}
            for i, raw in enumerate(path.read_text(encoding="utf8").splitlines(), 1):
                seen_full = False
                for mm in tok.finditer(raw):
                    if mm.group(1):
                        seen_full = True
                        continue
                    if seen_full:
                        continue
                    if f"{m}-PH{p}-{mm.group(2)}{mm.group(3)}" not in ids:
                        err(path, i, f"short ID {mm.group(2)}{mm.group(3)} not defined in this file")


# ---------------------------------------------------------------- dependency matrix
def phase_of(rid: str) -> int:
    return int(re.match(r"M\d-PH(\d)-", rid).group(1))


def module_of(rid: str) -> str:
    return rid[:2]


def check_handoffs(tasks, tcs):
    path = DOCS / "shared" / "dependency-matrix.md"
    text = path.read_text(encoding="utf8").splitlines()
    owner_of = {m: o for m, (_, o) in MODULES.items()}
    ids: set[str] = set()
    in_reg = False
    for i, raw in enumerate(text, 1):
        if raw.startswith("## Handoff register"):
            in_reg = True
            continue
        if in_reg and raw.startswith("## "):
            break
        if not in_reg:
            continue
        m = re.match(r"^\| (H\d\d) \|", raw)
        if not m:
            continue
        cols = split_row(raw)
        if len(cols) != 7:
            err(path, i, "handoff row needs 7 columns")
            continue
        hid, producer, consumers, delivered, needed, proof, subst = cols
        ids.add(hid)
        d_ids = sorted({r for r, _ in expand_ids(delivered) if "-T" in r and "-TC" not in r})
        n_ids = sorted({r for r, _ in expand_ids(needed) if "-T" in r and "-TC" not in r})
        p_ids = sorted({r for r, _ in expand_ids(proof) if "-TC" in r})
        # producers
        prod_names = [x.strip() for x in producer.split(",")]
        for d in d_ids:
            if owner_of[module_of(d)] not in prod_names:
                err(path, i, f"{hid}: delivering task {d} belongs to {owner_of[module_of(d)]}, producer column says {producer}")
        for n in n_ids:
            if owner_of[module_of(n)] not in [c.strip() for c in consumers.replace("(types)", "").replace("(frontend)", "").split(",")] + prod_names and "group" not in consumers.lower():
                warn(path, i, f"{hid}: consuming task {n} owner {owner_of[module_of(n)]} not in consumers '{consumers}'")
        if d_ids and n_ids:
            dp = max(phase_of(x) for x in d_ids)
            np_ = min(phase_of(x) for x in n_ids)
            if np_ < dp and subst.strip().lower() in ("none", "none."):
                err(path, i, f"{hid}: consumer phase PH{np_} precedes producer phase PH{dp} with no substitute")
        if not p_ids and not re.search(r"INT-|CP-", proof):
            err(path, i, f"{hid}: no proving test case listed")
    return ids


def check_tmp_register():
    path = DOCS / "shared" / "dependency-matrix.md"
    ids = set()
    in_t = False
    for raw in path.read_text(encoding="utf8").splitlines():
        if raw.startswith("## Temporary substitutes"):
            in_t = True
            continue
        if in_t and raw.startswith("## "):
            break
        m = re.match(r"^\| (TMP-\d\d) \|", raw)
        if in_t and m:
            ids.add(m.group(1))
    return ids


def check_decisions():
    path = DOCS / "shared" / "decision-register.md"
    text = path.read_text(encoding="utf8")
    return (
        set(re.findall(r"^\| (D-\d\d) \|", text, flags=re.M)),
        set(re.findall(r"^\| (EXT-\d\d) \|", text, flags=re.M)),
    )


def check_integration_ids():
    path = DOCS / "shared" / "integration-tests.md"
    text = path.read_text(encoding="utf8")
    return set(re.findall(r"^\| (INT-(?:CP-)?\d\d) \|", text, flags=re.M))


# ---------------------------------------------------------------- traceability coverage
def check_traceability() -> None:
    tr = (DOCS / "shared" / "traceability.md").read_text(encoding="utf8")
    sec = DOCS / "security-tests.md"
    sec_text = sec.read_text(encoding="utf8")
    for row in WORKSHEET:
        if not re.search(rf"^\| {re.escape(row)} \|", tr, flags=re.M):
            err(DOCS / "shared" / "traceability.md", 1, f"worksheet row {row} missing from traceability section F")
        if not re.search(rf"^\| {re.escape(row)} \|", sec_text, flags=re.M):
            err(sec, 1, f"worksheet row {row} missing from security-tests.md")
    for feat in FEATURES:
        if feat not in tr:
            err(DOCS / "shared" / "traceability.md", 1, f"feature {feat} missing from traceability")
    for ep in ENDPOINTS:
        if not re.search(rf"\b{ep}\b", tr) and ep not in ("A19",):
            warn(DOCS / "shared" / "traceability.md", 1, f"endpoint {ep} not mentioned in traceability")
    contract = (DOCS / "shared" / "system-contract.md").read_text(encoding="utf8")
    for ep in ENDPOINTS:
        if not re.search(rf"^\| {ep} \|", contract, flags=re.M):
            err(DOCS / "shared" / "system-contract.md", 1, f"endpoint {ep} missing from contract table")
    # every module test plan mentions its features
    for m, (folder, _) in MODULES.items():
        tp = (DOCS / "modules" / folder / "test-plan.md").read_text(encoding="utf8")
        for feat in [x for x in FEATURES if x.startswith(m)]:
            if feat not in tp:
                err(DOCS / "modules" / folder / "test-plan.md", 1, f"{feat} missing from test plan")


def check_tasks_traced(tasks) -> None:
    """Every (CP) marker in PH1/PH2 must appear in the execution sequence or framework."""
    exec_text = (DOCS / "shared" / "execution-sequence.md").read_text(encoding="utf8")
    for tid, info in tasks.items():
        if info["cp"] and tid not in exec_text:
            ids = {r for r, _ in expand_ids(exec_text)}
            if tid not in ids:
                warn(info["path"], info["line"], f"(CP) task {tid} not mentioned in execution-sequence.md")


# ---------------------------------------------------------------- generated index
def build_index(m: str, tcs) -> str:
    rows = ["| Test case | Phase | Type (family) | Maps to | Defined at |", "| --- | --- | --- | --- | --- |"]
    for tid in sorted(k for k in tcs if k.startswith(m + "-")):
        info = tcs[tid]
        cols = info["cols"]
        rel = Path("phases") / info["path"].name
        rows.append(f"| {tid} | PH{info['phase']} | {cols[1]} | {cols[4]} | [{info['path'].name}]({rel.as_posix()}) |")
    return "\n".join(rows)


def sync_index(tcs, write: bool) -> None:
    for m, (folder, _) in MODULES.items():
        path = DOCS / "modules" / folder / "test-plan.md"
        text = path.read_text(encoding="utf8")
        pat = re.compile(r"(<!-- BEGIN TC INDEX -->\n)(.*?)(<!-- END TC INDEX -->)", re.S)
        mm = pat.search(text)
        if not mm:
            err(path, 1, "missing TC INDEX markers")
            continue
        new = build_index(m, tcs) + "\n"
        if mm.group(2) != new:
            if write:
                path.write_text(text[: mm.start(2)] + new + text[mm.end(2):], encoding="utf8")
            else:
                err(path, 1, "generated test index is stale; run with --write-index")


# ---------------------------------------------------------------- main
def main() -> int:
    write = "--write-index" in sys.argv
    files = md_files()
    check_fences(files)
    check_links(files)
    tasks, tcs = parse_phase_files()
    sync_index(tcs, write)
    tmps = check_tmp_register()
    decisions, exts = check_decisions()
    ints = check_integration_ids()
    handoffs = check_handoffs(tasks, tcs)
    check_short_ids_in_phase_files(tasks, tcs)
    check_references(files, tasks, tcs, handoffs, tmps, decisions, exts, ints)
    check_traceability()
    check_tasks_traced(tasks)
    print(f"phase files: {len(PHASE_FILES) * len(MODULES)}; tasks: {len(tasks)}; test cases: {len(tcs)}; "
          f"handoffs: {len(handoffs)}; substitutes: {len(tmps)}; decisions: {len(decisions)}; "
          f"external: {len(exts)}; integration scenarios: {len(ints)}")
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
