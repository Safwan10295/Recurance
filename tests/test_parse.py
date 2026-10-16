from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.extract.quotes import EXACT, SNAPPED, UNVERIFIED, check_quote
from pipeline.normalise.orgs import key, split_receivers
from pipeline.parse.report_page import classify_pdf, parse_date, parse_report_page
from pipeline.parse.sections import concerns_and_circumstances, split_sections
from pipeline.parse.text import html_to_text, norm_for_match, verify_quote
from pipeline.redact import REDACTED, redact
from pipeline.wording import is_clean, violations

PAGES = Path(__file__).parent / "fixtures" / "pages"
BASE = "https://www.judiciary.uk/prevention-of-future-death-reports/"


def page(slug):
    return parse_report_page(BASE + slug + "/", (PAGES / f"{slug}.html").read_text(encoding="utf-8"))


def test_old_page_has_metadata_and_pdfs_only():
    rp = page("jamil-ahmed-2")
    assert rp.report_date == "2019-11-15"
    assert rp.coroner == "James Bennett"
    assert rp.area == "Birmingham and Solihull"
    assert rp.receivers_raw == "Highways England"
    kinds = {p.filename: p.kind for p in rp.pdfs}
    assert kinds["Jamil-Ahmed.pdf"] == "report"
    assert kinds["Response-from-Highways-England_Redacted.pdf"] == "response"
    c, _, _ = concerns_and_circumstances(rp.body_text)
    assert c == ""


def test_2013_template_sections():
    rp = page("david-levett-prevention-of-future-deaths-report")
    assert rp.ref == "2023-0121" and rp.report_date == "2023-04-18"
    c, circ, _ = concerns_and_circumstances(rp.body_text)
    assert c.startswith("DURING THE COURSE OF THE INQUEST, EVIDENCE WAS GIVEN")
    assert "SMART MOTORWAY" in c and not c.rstrip().endswith("6")
    assert "MATTERS OF CONCERN" not in c
    assert circ.startswith("On the evening of 28th January 2018")


def test_new_template_order_and_generic_pdf():
    rp = page("pamela-hindley-prevention-of-future-deaths-report")
    sec = split_sections(rp.body_text)
    assert list(sec)[:4] == ["coroner", "date", "legal", "sent_to"]
    c, circ, summary = concerns_and_circumstances(rp.body_text)
    assert c.startswith("Rapid discharge events")
    assert summary.startswith("Inadequate social care provision")
    assert {p.kind for p in rp.pdfs if "Publication-Policy" in p.filename} == {"generic"}


@pytest.mark.parametrize("s,iso", [
    ("15 November 2019", "2019-11-15"), ("10/08/2026", "2026-08-10"), ("1st March 2021", "2021-03-01"),
    ("Sept 3, 2018", "2018-09-03"), ("3 Sept 2018", "2018-09-03"), ("rubbish", None),
])
def test_parse_date(s, iso):
    d = parse_date(s)
    assert (d.isoformat() if d else None) == iso


def test_classify_pdf_pattern_breakers():
    assert classify_pdf("2024-0267-Cornwall-Council.pdf", "X Y", 1, True) == "response"
    assert classify_pdf("Smith-2019-0001.pdf", "John Smith", 0, False) == "report"


def test_html_to_text_and_norm():
    t = html_to_text("<p>It’s a “test”&nbsp;<br>line two</p><table><tr><td>a</td><td>b</td></tr></table>")
    assert "It's a \"test\"" in t and "\nline two" in t
    assert norm_for_match("a\n\n b  c") == "a b c"


def test_quote_checks():
    src = "There was nowhere for the driver of the first vehicle to park safely, e.g. on a hard shoulder."
    assert verify_quote("nowhere for the driver of the first   vehicle to park safely", src)
    assert not verify_quote("park", src)
    st, q = check_quote("nowhere for the driver of the first vehicle to park safely", src)
    assert st == EXACT
    st, q = check_quote("nowhere for the driver of the vehicle to park safely, e.g. on a hard shoulder", src)
    assert st == SNAPPED and q in norm_for_match(src)
    st, _ = check_quote("completely different words that never appear in the source text", src)
    assert st == UNVERIFIED


def test_split_receivers_and_key():
    parts = split_receivers("Department of Health; Wigan Borough Clinical Commissioning Group; 5 Boroughs Partnership NHS Trust")
    assert parts == ["Department of Health", "Wigan Borough Clinical Commissioning Group", "5 Boroughs Partnership NHS Trust"]
    assert split_receivers("Chief Executive of National Highways") == ["National Highways"]
    assert key("Pennine Care NHS Foundation Trust") == key("Pennine Care NHS Trust")
    assert key("Her Majesty's Prison Service") == key("HM Prison Service")
    assert split_receivers("Cardiff and Vale University Health Board") == ["Cardiff and Vale University Health Board"]


def test_redaction_keeps_coroner_and_hides_names():
    people = [{"name": "Jane Doe", "role": "staff"}, {"name": "Anne Pember", "role": "coroner"}]
    t = "Dr Smith told Anne Pember that Jane Doe saw Mr Levett."
    out = redact(t, people, coroners={"Anne Pember"}, deceased={"David Levett"})
    assert "Jane Doe" not in out and "Smith" not in out and "Levett" not in out
    assert "Anne Pember" in out and REDACTED in out


def test_deceased_named_by_title_only():
    d = {"David Levett: Prevention of future deaths report"}
    out = redact("David Levett's car stopped. When David's mother called, Mary Levett, his wife, said.", [], set(), d)
    assert out == "[the deceased]'s car stopped. When [the deceased]'s mother called, [name redacted], his wife, said."
    # Places and other people who share a first name are left alone.
    out = redact("He went by St John Ambulance to the John Radcliffe Hospital.", [], set(), {"John Smith"})
    assert "St John Ambulance" in out and "John Radcliffe Hospital" in out
    # A name next to a role word is a relative or staff member, never the deceased.
    out = redact("His mother Mary called.", [], set(), {"Peter Westwell, Mary Cunningham"})
    assert out == "His mother [name redacted] called."


def test_untitled_staff_names_next_to_role_words():
    out = redact("Jane Smith, the triage nurse, did not escalate. The paramedic, Tom Hardy, arrived at the GP Practice.",
                 [], set(), {"Alan Able"})
    assert "Jane Smith" not in out and "Tom Hardy" not in out and "GP Practice" in out


def test_wording_rules():
    assert violations("The trust ignored the warning")
    assert violations("It failed to act")
    assert not is_clean("The organisation is responsible for the death")
    assert is_clean("A similar concern was raised again in 2022 after a stated action.")


def test_fuzzy_guard_blocks_different_places():
    from pipeline.normalise.orgs import distinctive_compatible

    assert not distinctive_compatible("southampton county council", "northampton county council")
    assert not distinctive_compatible("university hospital north midlands nhs trust", "north middlesex university hospital nhs trust")
    assert distinctive_compatible("leicester partnership nhs trust", "leicestershire partnership nhs trust")
    assert distinctive_compatible("shewsbury and telford hospital trust", "shrewsbury and telford hospital nhs trust")


def test_prefix_anchor_snaps_to_source_sentence():
    src = ("The Network Rail Signaller has no means through which to relay the details of any discussions with drivers "
           "(in this instance Mr Moore) to the train company Control who could then pass this information on. Next.")
    st, q = check_quote("The Network Rail Signaller has no means through which to relay the details of any discussions "
                        "with drivers to the train company Control", src)
    assert st == SNAPPED and q.endswith("pass this information on.") and verify_quote(q, src)
