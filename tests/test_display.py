"""Display helpers: grouped themes for the hazard map and filters, and title casing."""
from pipeline.export.web import restore_case
from pipeline.publish.hazard_map import _fit_square, theme_of


def test_theme_groups_most_specific_first():
    assert theme_of(["Hospital Death (Clinical Procedures and medical management) related deaths", "Suicide (from 2015)"]) == "Suicide"
    assert theme_of('["Road (Highways Safety) related deaths"]') == "Roads and rail"
    assert theme_of(["Alcohol, drugs medication related death"]) == "Drugs, alcohol and medication"
    assert theme_of([]) == "Other"


def test_restore_case_only_acronyms_and_prison_names():
    src = ["The ACCT process at HMP Woodhill was not followed. The London Ambulance Service said an ambulance was late."]
    assert restore_case("Inadequate acct case management at hmp woodhill", src) == "Inadequate ACCT case management at HMP Woodhill"
    assert restore_case("Delayed ambulance response", src) == "Delayed ambulance response"
    assert restore_case("Rigid mpsd questioning", []) == "Rigid MPDS questioning"
    # Shouted headings say nothing about casing.
    assert restore_case("No hard shoulder", ["THE SMART MOTORWAY HAS NO HARD SHOULDER"]) == "No hard shoulder"


def test_map_layout_keeps_proportions():
    import numpy as np

    xy = _fit_square(np.array([[0.0, 0.0], [10.0, 2.0]], dtype=np.float32))
    assert xy.min() >= 0 and xy.max() <= 1
    assert abs((xy[1, 0] - xy[0, 0]) / (xy[1, 1] - xy[0, 1]) - 5.0) < 1e-4  # aspect ratio preserved


def test_hazard_titles_never_say_causing():
    from pipeline.wording import neutral
    assert neutral("No hard shoulder on smart motorways causing unsafe stops") == "No hard shoulder on smart motorways leading to unsafe stops"
    assert neutral("Fires caused by emollients") == "Fires from emollients"
    assert neutral("Lack of root cause analysis") == "Lack of root cause analysis"
    assert neutral("Causes of delay unclear") == "Causes of delay unclear"


def test_dossier_narrative_tidied_after_redaction():
    from pipeline.export.web import dossier_text, whole_sentences
    assert whole_sentences("One sentence. Another that stops mid-wo") == "One sentence."
    assert whole_sentences("Complete.") == "Complete."
    assert dossier_text("No response was found for the 2018 [the deceased] report.") == "No response was found for the 2018 report."
    assert dossier_text("Raised again in 2017 ([the deceased]), where staff") == "Raised again in 2017, where staff"
    assert dossier_text("No response for the [the deceased], [the deceased] and [the deceased], or [the deceased] reports.") == "No response for those reports."
