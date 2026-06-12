# Regenerates the ScamGuard marketing one-pager (Downloads\ScamGuard.pdf)
# with copy reconciled against the implemented backend — see
# marketing-copy-fixes.md for the claim-by-claim rationale.
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
    TableStyle, HRFlowable, KeepTogether,
)

INK = HexColor("#1a2332")
ACCENT = HexColor("#1565c0")
GOOD = HexColor("#2e7d32")
BAD = HexColor("#c62828")
MUTED = HexColor("#5a6675")
PANEL = HexColor("#eef3f9")

def style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
    "kicker": style("kicker", fontName="Helvetica-Bold", fontSize=10, textColor=ACCENT, spaceAfter=2),
    "h1": style("h1", fontName="Helvetica-Bold", fontSize=26, leading=30, spaceAfter=6),
    "lede": style("lede", fontSize=11, leading=15, textColor=MUTED, spaceAfter=10),
    "h2": style("h2", fontName="Helvetica-Bold", fontSize=11, textColor=ACCENT, spaceBefore=12, spaceAfter=4),
    "h3": style("h3", fontName="Helvetica-Bold", fontSize=10, spaceAfter=2),
    "body": style("body", spaceAfter=5),
    "small": style("small", fontSize=8, leading=11, textColor=MUTED),
    "stat": style("stat", fontName="Helvetica-Bold", fontSize=16, textColor=ACCENT, alignment=1),
    "statlbl": style("statlbl", fontSize=8, textColor=MUTED, alignment=1),
    "plus": style("plus", fontSize=9, leading=12.5, textColor=GOOD),
    "minus": style("minus", fontSize=9, leading=12.5, textColor=BAD),
    "price": style("price", fontName="Helvetica-Bold", fontSize=14, spaceAfter=1),
    "tier": style("tier", fontName="Helvetica-Bold", fontSize=11, textColor=ACCENT),
    "foot": style("foot", fontSize=9, leading=12, textColor=MUTED, alignment=1),
}

def check(text):
    return Paragraph(f'<font color="#2e7d32">&#10003;</font> {text}', S["body"])

doc = BaseDocTemplate(
    r"C:\Users\mster\Downloads\ScamGuard.pdf",
    pagesize=letter,
    leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    topMargin=0.55 * inch, bottomMargin=0.55 * inch,
    title="ScamGuard — Real-time scam detection",
    author="ScamGuard",
)
W = doc.width
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])

el = []

# ---- Hero ----
el.append(Paragraph("FREE, OPEN-SOURCE BROWSER EXTENSION", S["kicker"]))
el.append(Paragraph("The internet has a scam problem.<br/>ScamGuard fixes it.", S["h1"]))
el.append(Paragraph(
    "Real-time scam detection powered by threat databases, domain intelligence, and verified "
    "community reports. Know if a site is legitimate before you hand over your money or "
    "personal information.", S["lede"]))

stats = Table(
    [[Paragraph("3 sec", S["stat"]), Paragraph("0 kb", S["stat"]), Paragraph("Free", S["stat"])],
     [Paragraph("to check any site", S["statlbl"]),
      Paragraph("system overhead", S["statlbl"]),
      Paragraph("community tier, forever", S["statlbl"])]],
    colWidths=[W / 3.0] * 3)
stats.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PANEL),
    ("TOPPADDING", (0, 0), (-1, 0), 8), ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
]))
el.append(stats)

# ---- How it works ----
el.append(Paragraph("HOW IT WORKS", S["h2"]))
how = Table([[
    [Paragraph("Automated scanning", S["h3"]),
     Paragraph("Pages are checked against Google Safe Browsing, urlscan.io, and domain "
               "registration age — instantly for premium users, up to 50 cloud checks a day "
               "on the free tier, with local protection always on.", S["body"])],
    [Paragraph("Smart heuristics", S["h3"]),
     Paragraph("Local analysis catches impersonated brand names, bait-word domains, "
               "suspicious TLDs, missing HTTPS, and prices too good to be true — even "
               "offline, with nothing sent anywhere.", S["body"])],
    [Paragraph("Community reports", S["h3"]),
     Paragraph("Users flag scam sites in one tap. Reports are anonymous, require multiple "
               "independent reporters plus verification, and then protect every ScamGuard "
               "user worldwide.", S["body"])],
]], colWidths=[W / 3.0] * 3)
how.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
]))
el.append(how)

# ---- Why not Norton ----
el.append(Paragraph("WHY NOT NORTON OR McAFEE?", S["h2"]))
vs = Table([
    [Paragraph("<b>ScamGuard</b>", S["h3"]), Paragraph("<b>Norton / McAfee</b>", S["h3"])],
    [[Paragraph("+ Browser extension only — zero system footprint", S["plus"]),
      Paragraph("+ Crowdsourced and verified: new scams caught fast", S["plus"]),
      Paragraph("+ Transparent scoring — you see exactly why", S["plus"]),
      Paragraph("+ Free community tier, no upsell treadmill", S["plus"]),
      Paragraph("+ Open-source backend — audit it yourself", S["plus"])],
     [Paragraph("&#8722; Heavy desktop install, always running", S["minus"]),
      Paragraph("&#8722; Centralized DB — new scam sites slip through for days", S["minus"]),
      Paragraph("&#8722; Black-box decisions — no explanation given", S["minus"]),
      Paragraph("&#8722; $40–$100/yr with aggressive renewal tactics", S["minus"]),
      Paragraph("&#8722; Known to slow machines and add unwanted software", S["minus"])]],
], colWidths=[W / 2.0] * 2)
vs.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BACKGROUND", (0, 0), (-1, 0), PANEL),
    ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
el.append(vs)

# ---- Waze effect ----
el.append(Paragraph("THE WAZE EFFECT", S["h2"]))
waze = Table([[
    [Paragraph("The problem with traditional security", S["h3"]),
     Paragraph("A scam shop that launched this morning won't appear on any blacklist until "
               "tomorrow — or next week. By then, hundreds of people have already lost money. "
               "Corporate security teams simply can't move fast enough.", S["body"])],
    [Paragraph("Crowdsourcing closes the gap", S["h3"]),
     Paragraph("The first person to visit a new scam site flags it. Others independently "
               "confirm it. Once corroborated and verified, the warning goes live for every "
               "ScamGuard user worldwide — automatically, with no corporate update cycle. "
               "Sites already flagged by threat databases are blocked within seconds.", S["body"])],
]], colWidths=[W / 2.0] * 2)
waze.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
]))
el.append(waze)

# ---- Pricing (kept together so tiers and their benefits never split
# across a page break) ----
pricing_block = [Paragraph("PRICING", S["h2"])]
pricing = Table([
    [Paragraph("Free", S["tier"]), Paragraph("Premium", S["tier"]), Paragraph("Contributor", S["tier"])],
    [Paragraph("$0 forever", S["price"]), Paragraph("$3/mo", S["price"]), Paragraph("Earned", S["price"])],
    [[check("Community trust scores"),
      check("One-tap scam reporting"),
      check("Local heuristics (runs in browser)"),
      check("50 cloud API checks per day"),
      Paragraph("&#8722; Unlimited real-time scans", S["minus"])],
     [Paragraph("Unlimited protection for power users.", S["small"]),
      check("Everything in Free"),
      check("Unlimited real-time cloud checks"),
      check("Deep domain &amp; metadata scans"),
      check("Personal security dashboard &#8224;"),
      check("Priority support")],
     [Paragraph("Active reporters get Premium free.", S["small"]),
      check("Everything in Premium"),
      check("Earned by flagging verified scams"),
      check("1 Premium Day per confirmed report&#42;"),
      check("No credit card ever needed")]],
], colWidths=[W / 3.0] * 3)
pricing.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BACKGROUND", (0, 0), (-1, 1), PANEL),
    ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LINEAFTER", (0, 0), (1, -1), 0.5, HexColor("#d4dde8")),
]))
pricing_block.append(pricing)
pricing_block.append(Spacer(1, 4))
pricing_block.append(Paragraph(
    "&#42; Premium Days are awarded for verified scam reports — confirmed against external threat "
    "databases or by human review — up to 4 days per month. "
    "&#8224; Dashboard statistics are computed and stored inside your browser only; they are never "
    "sent to our servers.", S["small"]))
el.append(KeepTogether(pricing_block))

# ---- FAQ ----
el.append(Paragraph("COMMON QUESTIONS", S["h2"]))
faq = [
    ("Does it slow down my browser?",
     "No. ScamGuard runs checks in the background after a page loads. It adds no measurable "
     "overhead to page load time and has zero impact on your system outside the browser."),
    ("Is my browsing history tracked?",
     "No. Only the domain name of the current page is ever sent to our servers — not the full "
     "URL, not your identity, not your browsing history. Community reports are attached to an "
     "anonymous ID generated on install, never your email or name. You can erase everything "
     "tied to that ID at any time."),
    ("What if a legitimate site gets flagged?",
     "A community scam verdict requires multiple independent reporters with established account "
     "history, agreement over time, and verification against external threat databases or human "
     "review — so a handful of fake accounts can't condemn a legitimate site. Users can also "
     "report a site as \"looks legit,\" which counts against a scam consensus, and site owners "
     "can dispute any flag. Scoring is transparent: you always see exactly which signals "
     "triggered a warning."),
    ("What makes community reports trustworthy?",
     "Reports only count once an account has history, and every community-driven verdict is "
     "verified before it goes live. Reporters whose flags are confirmed earn Premium Days — "
     "rewarding accuracy, not volume."),
    ("Why is it free? What's the business model?",
     "The community layer stays free because the network effect is the product — more users "
     "means better protection for everyone. Revenue comes from the premium tier and an "
     "aggregated, anonymized threat-intelligence feed for brands that want early warning when "
     "scam domains impersonate them."),
]
for q, a in faq:
    el.append(KeepTogether([Paragraph(q, S["h3"]), Paragraph(a, S["body"])]))

# ---- Footer ----
el.append(Spacer(1, 6))
el.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#d4dde8")))
el.append(Spacer(1, 6))
el.append(Paragraph(
    "ScamGuard's backend is open source (MIT) — github.com/Strelzik/scamguard-backend. "
    "The community data belongs to the community.<br/>"
    "<b>Built to protect people, not to extract from them.</b>", S["foot"]))

doc.build(el)
print("Wrote ScamGuard.pdf")
