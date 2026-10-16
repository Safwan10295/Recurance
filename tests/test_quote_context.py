"""The "Verified word for word" context window: located around the quote, cut at words, strictly redacted."""
import sqlite3

from pipeline.export.web import Redactor, quote_context


def conn_with(concerns: str, title: str = "Jane Doe: Prevention of future deaths report", people=()):
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.execute("CREATE TABLE reports (url TEXT, title TEXT, coroner TEXT, area TEXT, concerns TEXT, circumstances TEXT, body_text TEXT)")
    c.execute("CREATE TABLE people_mentions (report_url TEXT, name TEXT, role TEXT)")
    c.execute("CREATE TABLE organisations (canonical_name TEXT)")
    c.execute("INSERT INTO reports VALUES ('u', ?, 'A Coroner', 'Surrey', ?, '', '')", (title, concerns))
    c.executemany("INSERT INTO people_mentions VALUES ('u', ?, ?)", people)
    c.execute("INSERT INTO people_mentions VALUES ('other', 'Paul Jones', 'witness')")  # first names come from the whole archive
    return c


QUOTE = "There is no requirement for drivers over 70 to have a medical assessment."


def test_context_found_and_split_around_quote():
    c = conn_with(f"(1) The road was dark. {QUOTE} (2) Signs were unclear.")
    ctx = quote_context(c, "u", QUOTE, Redactor(c))
    assert ctx["before"] == "(1) The road was dark."
    assert ctx["after"] == "(2) Signs were unclear."
    assert ctx["section"] == "the coroner's concerns" and not ctx["cut_start"] and not ctx["cut_end"]


def test_context_cut_at_word_boundaries():
    c = conn_with("word " * 100 + QUOTE + " tail" * 100)
    ctx = quote_context(c, "u", QUOTE, Redactor(c), n=50)
    assert ctx["cut_start"] and ctx["cut_end"]
    assert not ctx["before"].startswith("ord") and set(ctx["before"].split()) == {"word"}
    assert set(ctx["after"].split()) == {"tail"}


def test_context_strictly_redacts_names():
    text = (f"Jane's mother raised it with Paul Newton, and Mr Smith agreed. {QUOTE} "
            "Staff at the John Radcliffe Hospital and St John Ambulance were told by Ms Shanté Turay-Thomas.")
    c = conn_with(text, people=[("Shanté Turay-Thomas", "nurse")])
    ctx = quote_context(c, "u", QUOTE, Redactor(c))
    out = ctx["before"] + " " + ctx["after"]
    for name in ("Jane", "Paul", "Newton", "Smith", "Shanté", "Turay"):
        assert name not in out, (name, out)
    assert "John Radcliffe Hospital" in out and "St John Ambulance" in out


def test_no_context_for_missing_or_short_quote():
    c = conn_with("Something else entirely, long enough to search in.")
    assert quote_context(c, "u", QUOTE, Redactor(c)) is None
    assert quote_context(c, "u", "too short", Redactor(c)) is None


def test_first_name_pass_on_quotes():
    from pipeline.export.web import first_name_pass
    c = conn_with("x")
    c.execute("INSERT INTO people_mentions VALUES ('other', 'Samantha Jones', 'witness')")
    red = Redactor(c)
    red.coroners = {"Samantha Jones", "Paul Coroner"}
    assert first_name_pass("In Chris' case, care provided to Sam was late.", red) == "In [name redacted]' case, care provided to [name redacted] was late."
    assert first_name_pass("A Clare's Law application, at HMP Garth, an Amber 2 call.", red) == "A Clare's Law application, at HMP Garth, an Amber 2 call."
    assert first_name_pass("Senior Coroner Paul Coroner wrote.", red) == "Senior Coroner Paul Coroner wrote."
    assert first_name_pass("Paul said so.", red) == "[name redacted] said so."

