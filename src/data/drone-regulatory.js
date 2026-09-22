/* =====================================================================
   MASS THRESHOLDS — what a number actually gates, and under whose law
   =====================================================================
   GENERATED FILE. Do not hand-edit. Regenerate with
   eVTOL_Sizing_Research/datasets/drone/gen_regulatory.py.

   WHY THIS IS A TABLE OF CLAUSES AND NOT A LIST OF BANDS.
   The familiar picture -- nano / micro / mini / small / medium -- does
   not survive contact with the rules. Sourced from the primary texts:

     - 25 kg IS NOT 55 lb. 55 lb = 24.947580 kg; 25 kg = 55.1156 lb.
       Both limits are strict, so a 25.000 kg design fails BOTH. The
       usable ceilings are 24.999 kg (EU) and 24.947 kg (US), 52 g
       apart. Searching the eCFR XML for 14 CFR parts 1, 48, 107 and
       137 returns ZERO occurrences of "kilogram" or "kg": the FAA
       rule is imperial throughout.
     - 250 g IS NOT 0.55 lb either. 0.55 lb = 249.4758 g, so a 250.0 g
       aircraft is OVER the US line and ON the EU, Canadian and
       Australian one.
     - THE US 0.55 lb RULE GATES REGISTRATION, NOT OPERATION, and only
       for recreational flight: 14 CFR 48.15(b) is available solely to
       aircraft operated exclusively under 49 USC 44809. There is no
       sub-250 g commercial registration exemption in US law.
     - MASS ALONE DOES NOT DECIDE. The EU also registers on an 80 J
       impact-energy branch and on carrying a personal-data sensor AT
       ANY MASS; the UK replaced the sensor test with a 100 g mass test
       in force 1 Jan 2026. NATO's airworthiness floor is 66 J. C3, C5
       and C6 carry a 3 m dimension limit. So a classifier given only a
       mass must say what it cannot decide, and this one does.
     - "NANO" HAS NO LEGAL BASIS ANYWHERE, including in the real NATO
       table. "Micro" and "medium" DO -- Australia's CASR 101.022 and
       Canada's CARs 900.01 make them statutory -- but with different
       numbers from each other and from NATO, whose MICRO is under 2 kg
       against Australia's 250 g. A class word without a jurisdiction
       attached is therefore meaningless, and this module never emits
       one.
     - NATO's Class I/II/III table is DOCTRINE, binding on nobody, and
       is held here one step removed from primary: the JAPCC CONEMP
       reproduces it, and JAPCC is a NATO-accredited centre of
       excellence rather than a standardization body. Its own companion
       article states it "does not represent the opinions or policies
       of NATO". NATO's TACTICAL tier is 150-600 kg, not a small drone.
     - ICAO DEFINES NO MASS CLASSES. RPAS CONOPS 3.2.1: "For this
       CONOPS, RPAS are not classified based on any physical
       configuration, size, or performance attributes." The masses in
       its Model UAS Regulations are bracketed placeholders.

   43 thresholds, 31 in force. Generated 2026-09-21
   ===================================================================== */

/* Exact conversions, so no rounding is ever invented downstream. */
export const KG_PER_LB = 0.45359237;
export const US_PART107_CEILING_KG = 55 * 0.45359237;   // 24.947580 kg
export const EU_OPEN_CEILING_KG = 25;                    // stated in kg
export const US_REGISTRATION_KG = 0.55 * 0.45359237;     // 0.2494758 kg

export const THRESHOLDS = Object.freeze([
  Object.freeze({
    kg: 0.1, statedValue: "100 g", statedUnit: "g",
    jurisdiction: "UK",
    document: "Commission Implementing Regulation (EU) 2019/947 as assimilated into UK law; words substituted 1 Jan 2026 by The Unmanned Aircraft (Amendment) Regulations 2025 (S.I. 2025/1106) reg. 22(a)", clause: "Article 14(5)(a)(ii)",
    gates: "operator registration (camera-carrying UAS in the open category)",
    status: "in force",
    quote: "UAS operators shall register themselves: (a) when operating within the 'open' category any of the following unmanned aircraft: ... ii. that is equipped with a camera and has a MTOM of 100 g or more.",
    url: "https://www.legislation.gov.uk/eur/2019/947/body",
    note: "UK replaced the EU's qualitative 'sensor able to capture personal data' test with a 100 g mass test.",
  }),
  Object.freeze({
    kg: 0.2494758, statedValue: "0.55 pounds", statedUnit: "lb",
    jurisdiction: "USA (FAA)",
    document: "14 CFR Part 48 - Registration and Marking Requirements for Small Unmanned Aircraft", clause: "Sec. 48.15(b)",
    gates: "registration only (exemption from aircraft registration); available ONLY to aircraft operated exclusively under 49 U.S.C. 44809, i.e. recreational",
    status: "in force",
    quote: "No person may operate a small unmanned aircraft that is eligible for registration under 49 U.S.C. 44101-44103 unless one of the following criteria has been satisfied: (a) The owner has registered and marked the aircraft in accordance with this part; (b) The aircraft is operated exclusively in compliance with 49 U.S.C. 44809 and weighs 0.55 pounds or less on takeoff, including everything that is on board or otherwise attached to the aircraft; or (c) The aircraft is an aircraft of the Armed Forces of the United States.",
    url: "https://www.ecfr.gov/api/versioner/v1/full/2026-09-01/title-14.xml?part=48",
    note: "0.55 lb = 249.4758 g, NOT 250 g. Commercial (Part 107) operation of any mass requires registration - there is no sub-250 g commercial exemption in US law.",
  }),
  Object.freeze({
    kg: 0.2494758, statedValue: "0.55 pounds", statedUnit: "lb",
    jurisdiction: "USA (FAA)",
    document: "14 CFR Part 107 - Small Unmanned Aircraft Systems", clause: "Sec. 107.110(a)(1)",
    gates: "operation over human beings (Category 1)",
    status: "in force",
    quote: "Weighs 0.55 pounds or less on takeoff and throughout the duration of each operation under Category 1, including everything that is on board or otherwise attached to the aircraft; and",
    url: "https://www.ecfr.gov/api/versioner/v1/full/2026-09-01/title-14.xml?part=107",
    note: "Only place in Part 107 where 0.55 lb appears. Unlike Sec. 48.15 this is 'throughout the duration', not just takeoff.",
  }),
  Object.freeze({
    kg: 0.25, statedValue: "250 g", statedUnit: "g",
    jurisdiction: "Australia",
    document: "Civil Aviation Safety Regulations 1998 (Cth), compilation No. 102, in force 30 June 2026", clause: "regulation 101.022, table 'Types of RPA', item 1",
    gates: "statutory class 'micro RPA'; drives operating rules and accreditation requirements",
    status: "in force",
    quote: "micro RPA - an RPA with a gross weight of not more than 250 g.",
    url: "https://www.legislation.gov.au/F1998B00220/2026-06-30/2026-06-30/text/original/epub/OEBPS/document_3/document_3.html",
  }),
  Object.freeze({
    kg: 0.25, statedValue: "250 g (0.55 pounds)", statedUnit: "g (with lb parenthetical)",
    jurisdiction: "Canada",
    document: "Canadian Aviation Regulations (SOR/96-433), Part IX", clause: "section 900.13(1)",
    gates: "AIRCRAFT registration - applies to recreational and commercial alike",
    status: "in force",
    quote: "Subject to subsection (2), no person shall operate a remotely piloted aircraft system that includes a remotely piloted aircraft having an operating weight of 250 g (0.55 pounds) or more unless the remotely piloted aircraft is registered in accordance with this Division.",
    url: "https://laws-lois.justice.gc.ca/eng/regulations/SOR-96-433/section-900.13.html",
  }),
  Object.freeze({
    kg: 0.25, statedValue: "250 g (0.55 pounds)", statedUnit: "g (with lb parenthetical)",
    jurisdiction: "Canada",
    document: "Canadian Aviation Regulations (SOR/96-433), Part IX", clause: "section 900.01, definition 'small remotely piloted aircraft' (lower bound)",
    gates: "statutory class boundary -> applicability of Subpart 901, pilot certificate requirements",
    status: "in force",
    quote: "small remotely piloted aircraft means a remotely piloted aircraft that has an operating weight of at least 250 g (0.55 pounds) but not more than 25 kg (55 pounds).",
    url: "https://laws-lois.justice.gc.ca/eng/regulations/SOR-96-433/section-900.01.html",
    note: "'operating weight' is defined as the weight at ANY point during a flight, not take-off mass.",
  }),
  Object.freeze({
    kg: 0.25, statedValue: "250 g", statedUnit: "g",
    jurisdiction: "EU",
    document: "Commission Delegated Regulation (EU) 2019/945, Annex (restated by Commission Delegated Regulation (EU) 2020/1058)", clause: "Annex Part 1(1) - class C0",
    gates: "product class marking C0; unlocks subcategory A1 operation over uninvolved persons",
    status: "in force",
    quote: "A class C0 UAS shall comply with the following: (1) have an MTOM of less than 250 g, including payload;",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019R0945",
  }),
  Object.freeze({
    kg: 0.25, statedValue: "250 g", statedUnit: "g",
    jurisdiction: "EU",
    document: "Commission Implementing Regulation (EU) 2019/947, consolidated as at 2025-05-01", clause: "Article 14(5)(a)(i)",
    gates: "UAS OPERATOR registration (not aircraft registration)",
    status: "in force",
    quote: "UAS operators shall register themselves: (a) when operating within the 'open' category any of the following unmanned aircraft: i. with a MTOM of 250 g or more, or, which in the case of an impact can transfer to a human kinetic energy above 80 Joules; ii. that is equipped with a sensor able to capture personal data, unless it complies with Directive 2009/48/EC. (b) when operating within the 'specific' category an unmanned aircraft of any mass.",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02019R0947-20250501",
    note: "Not a clean mass cut-off: an 80 J impact-energy branch and a personal-data-sensor branch both trigger registration below 250 g, and the specific category triggers it at any mass.",
  }),
  Object.freeze({
    kg: 0.25, statedValue: "250 g", statedUnit: "g",
    jurisdiction: "EU / UK",
    document: "Commission Implementing Regulation (EU) 2019/947, Annex Part A; and Article 20(a)", clause: "UAS.OPEN.020(5)(a); Article 20(a)",
    gates: "operation in subcategory A1 for privately built UAS and for legacy (pre-1 July 2022) non-class-marked UAS",
    status: "in force",
    quote: "has an MTOM, including payload, of less than 250 g and a maximum operating speed of less than 19 m/s, in the case of a privately built UAS; or",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02019R0947-20250501",
  }),
  Object.freeze({
    kg: 0.5, statedValue: "500 g", statedUnit: "g",
    jurisdiction: "EU",
    document: "Commission Implementing Regulation (EU) 2019/947", clause: "Article 22(a)",
    gates: "transitional operation of non-class-marked UAS under A1-style conditions",
    status: "EXPIRED 31 December 2023",
    quote: "unmanned aircraft with a take-off mass of less than 500 g are operated within the operational requirements set out in points UAS.OPEN.020(1) of Part A of the Annex by a remote pilot having competency level defined by the Member State concerned;",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02019R0947-20250501",
  }),
  Object.freeze({
    kg: 0.9, statedValue: "900 g", statedUnit: "g",
    jurisdiction: "EU / UK",
    document: "Commission Delegated Regulation (EU) 2019/945, Annex Part 2 (UK: class UK1)", clause: "Annex Part 2(1) - class C1",
    gates: "product class marking C1 -> subcategory A1 operation",
    status: "in force",
    quote: "be made of materials and have performance and physical characteristics such as to ensure that in the event of an impact at terminal velocity with a human head, the energy transmitted to the human head is less than 80 J, or, as an alternative, shall have an MTOM of less than 900 g, including payload;",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019R0945",
    note: "900 g is an ALTERNATIVE to the 80 J head-impact showing. A compliant C1 aircraft may exceed 900 g.",
  }),
  Object.freeze({
    kg: 1.0, statedValue: "1 kg", statedUnit: "kg",
    jurisdiction: "UK",
    document: "The Air Navigation Order 2016 (S.I. 2016/765)", clause: "Schedule 1, definition 'tethered small unmanned aircraft'",
    gates: "definition used for tethered-flight provisions",
    status: "in force",
    quote: "'tethered small unmanned aircraft' means an unmanned aircraft- (a) having a MTOM, within the meaning of Article 2 of the Unmanned Aircraft Implementing Regulation, of not more than 1kg; and (b) which is flown within limits imposed by a restraining device which attaches the aircraft to the surface or to a person on the surface;",
    url: "https://www.legislation.gov.uk/uksi/2016/765/schedule/1",
    note: "Compare the US tether figure of 55 pounds in 49 U.S.C. 44801(1)(A).",
  }),
  Object.freeze({
    kg: 2.0, statedValue: "2 kg", statedUnit: "kg",
    jurisdiction: "Australia",
    document: "Civil Aviation Safety Regulations 1998 (Cth), compilation No. 102", clause: "regulation 101.022, item 2",
    gates: "statutory class 'very small RPA'",
    status: "in force",
    quote: "very small RPA - an RPA with a gross weight of more than 250 g, but not more than 2 kg.",
    url: "https://www.legislation.gov.au/F1998B00220/2026-06-30/2026-06-30/text/original/epub/OEBPS/document_3/document_3.html",
  }),
  Object.freeze({
    kg: 2.0, statedValue: "2 kg", statedUnit: "kg",
    jurisdiction: "EU",
    document: "Commission Implementing Regulation (EU) 2019/947", clause: "Article 22(b)",
    gates: "transitional A2-style operation at 50 m horizontal from people",
    status: "EXPIRED 31 December 2023",
    quote: "unmanned aircraft with a take-off mass of less than 2 kg is operated by keeping a minimum horizontal distance of 50 meters from people and the remote pilots have a competency level at least equivalent to the one set out in point UAS.OPEN.030(2) of Part A of the Annex;",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02019R0947-20250501",
  }),
  Object.freeze({
    kg: 2.0, statedValue: "<2 kg (MICRO) / 2-20 kg (MINI)", statedUnit: "kg",
    jurisdiction: "NATO (doctrine, not law)",
    document: "JAPCC UAS CONEMP (2010), Table 1, captioned 'NATO UAS Classification Guide. September 2009 JCGUAV meeting'", clause: "Table 1, Class I tiers",
    gates: "nothing legally; doctrinal tiering for force structure and procurement",
    status: "doctrine; primary JCGUAV source not obtained",
    quote: "CLASS I (less than 150 kg) | SMALL >20 kg | MINI 2-20 kg | MICRO <2 kg",
    url: "https://www.japcc.org/wp-content/uploads/UAS_CONEMP.pdf",
    note: "There is NO nano tier in this table. 'TACTICAL' is Class II (150-600 kg), not a Class I tier.",
  }),
  Object.freeze({
    kg: 2.0, statedValue: "2 kg", statedUnit: "kg",
    jurisdiction: "UK",
    document: "Commission Implementing Regulation (EU) 2019/947 as assimilated into UK law, Annex Part A (UK-added limb)", clause: "UAS.OPEN.030(3), added limb",
    gates: "operation in subcategory A2 with a non-class-marked aircraft - permanent, unlike the EU equivalent",
    status: "in force",
    quote: "has an MTOM of less than 2 kg, does not comply with the requirements in Part 3 of the Annex to the Delegated Regulation (EU) 2019/945 and was placed on the market before 1st January 2026.",
    url: "https://www.legislation.gov.uk/eur/2019/947/annex",
  }),
  Object.freeze({
    kg: 4.0, statedValue: "4 kg", statedUnit: "kg",
    jurisdiction: "EU / UK",
    document: "Commission Delegated Regulation (EU) 2019/945, Annex Part 3 (UK: class UK2)", clause: "Annex Part 3(1) - class C2",
    gates: "product class marking C2 -> subcategory A2 operation (30 m, or 5 m in low-speed mode, from uninvolved persons)",
    status: "in force",
    quote: "A class C2 UAS shall comply with the following: (1) have an MTOM of less than 4 kg, including payload;",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019R0945",
  }),
  Object.freeze({
    kg: 7.0, statedValue: "7 kg", statedUnit: "kg",
    jurisdiction: "Australia",
    document: "Civil Aviation Safety Regulations 1998 (Cth), compilation No. 102", clause: "regulation 101.023(1)(b)",
    gates: "definition of 'model aircraft' when operated for educational, training or research purposes",
    status: "in force",
    quote: "if the aircraft has a gross weight of not more than 7 kg, and is being operated in connection with the educational, training or research purposes of:",
    url: "https://www.legislation.gov.au/F1998B00220/2026-06-30/2026-06-30/text/original/epub/OEBPS/document_3/document_3.html",
  }),
  Object.freeze({
    kg: 10.0, statedValue: "10 kg", statedUnit: "kg",
    jurisdiction: "EU / UK",
    document: "Commission Implementing Regulation (EU) 2019/947, Annex Part A", clause: "UAS.OPEN.010(4)",
    gates: "derogation from the 120 m height limit for unmanned sailplanes",
    status: "in force",
    quote: "By way of derogation from point (2), unmanned sailplanes with a MTOM, including payload, of less than 10 kg, may be flown at a distance in excess of 120 metres from the closest point of the surface of the earth, provided that the unmanned sailplane is not flown at a height greater than 120 metres above the remote pilot at any time.",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02019R0947-20250501",
  }),
  Object.freeze({
    kg: 15.0, statedValue: "[15 kg]", statedUnit: "kg (bracketed placeholder)",
    jurisdiction: "ICAO (model text, non-binding)",
    document: "ICAO Model UAS Regulations, Parts 101 and 102, 23 June 2020", clause: "rule 101.37(b)",
    gates: "model text: construction/modification inspection and approval",
    status: "non-binding model text; brackets are ICAO's own placeholder notation",
    quote: "A person shall not operate a UA with a gross mass of between [15 kg] and [25 kg] unless the UA, and any modification made to it, is: (1) constructed under the authority of, or inspected and approved by, an approved person or approved aviation organization defined in rule 101.21;",
    url: "https://www.icao.int/sites/default/files/sp-files/safety/UA/Documents/Model%20UAS%20Regulations%20-%20Parts%20101%20and%20102.pdf",
  }),
  Object.freeze({
    kg: 20.0, statedValue: ">20 kg (SMALL) / 2-20 kg (MINI)", statedUnit: "kg",
    jurisdiction: "NATO (doctrine, not law)",
    document: "JAPCC UAS CONEMP (2010), Table 1", clause: "Table 1, Class I tiers",
    gates: "nothing legally",
    status: "doctrine",
    quote: "CLASS I (less than 150 kg) | SMALL >20 kg | Tactical Unit (employs launch system) | Up to 5K ft AGL | 50 km (LOS) | BN/Regt, BG | Luna, Hermes 90",
    url: "https://www.japcc.org/wp-content/uploads/UAS_CONEMP.pdf",
  }),
  Object.freeze({
    kg: 24.94758, statedValue: "55 pounds", statedUnit: "lb",
    jurisdiction: "USA (FAA)",
    document: "14 CFR Part 107 - Small Unmanned Aircraft Systems (identical text at 14 CFR 1.1)", clause: "Sec. 107.3, definition 'Small unmanned aircraft'",
    gates: "applicability of the whole of Part 107 - pilot certification, operating rules, registration route",
    status: "in force",
    quote: "Small unmanned aircraft means an unmanned aircraft weighing less than 55 pounds on takeoff, including everything that is on board or otherwise attached to the aircraft.",
    url: "https://www.ecfr.gov/api/versioner/v1/full/2026-09-01/title-14.xml?part=107",
    note: "No kilogram figure appears anywhere in 14 CFR parts 1, 48 or 107 (verified by grep). 55 lb = 24.947580 kg, not 25 kg. It is 'less than', so 55.0 lb is outside Part 107. Sec. 107.3 is NOT in the Sec. 107.205 list of waivable regulations, so the mass limit cannot be waived.",
  }),
  Object.freeze({
    kg: 24.94758, statedValue: "55 pounds", statedUnit: "lb",
    jurisdiction: "USA (statute)",
    document: "49 U.S.C. Chapter 448 - Unmanned Aircraft Systems", clause: "Sec. 44801(9)",
    gates: "statutory definition of 'small unmanned aircraft' underpinning 14 CFR 107.3",
    status: "in force (text current to 20 September 2026)",
    quote: "Small unmanned aircraft.-The term 'small unmanned aircraft' means an unmanned aircraft weighing less than 55 pounds, including the weight of anything attached to or carried by the aircraft.",
    url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title49-section44801&num=0&edition=prelim",
  }),
  Object.freeze({
    kg: 24.94758, statedValue: "55 pounds", statedUnit: "lb",
    jurisdiction: "USA (statute)",
    document: "49 U.S.C. Chapter 448", clause: "Sec. 44801(1)(A), definition 'actively tethered unmanned aircraft system'",
    gates: "definition of actively tethered UAS",
    status: "in force",
    quote: "Actively tethered unmanned aircraft system.-The term 'actively tethered unmanned aircraft system' means an unmanned aircraft system in which the unmanned aircraft component- (A) weighs 55 pounds or less, including payload but not including the tether;",
    url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title49-section44801&num=0&edition=prelim",
    note: "Was 4.4 pounds until amended in 2024 by Pub. L. 118-63 sec. 926(c)(1).",
  }),
  Object.freeze({
    kg: 24.94758, statedValue: "55 pounds", statedUnit: "lb",
    jurisdiction: "USA (statute)",
    document: "49 U.S.C. Chapter 448", clause: "Sec. 44809(c)(3)",
    gates: "RECREATIONAL operation of unmanned aircraft at or above 55 lb - permitted via CBO standards at an approved fixed site",
    status: "in force",
    quote: "Unmanned aircraft weighing 55 pounds or greater.-A person may operate an unmanned aircraft weighing 55 pounds or greater, including the weight of anything attached to or carried by the aircraft, if- (A) the unmanned aircraft complies with standards and limitations developed by a community-based organization and approved by the Administrator; and (B) the aircraft is operated from a fixed site as described in paragraph (1).",
    url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title49-section44809&num=0&edition=prelim",
  }),
  Object.freeze({
    kg: 25.0, statedValue: "25 kg", statedUnit: "kg",
    jurisdiction: "Australia",
    document: "Civil Aviation Safety Regulations 1998 (Cth), compilation No. 102", clause: "regulation 101.022, item 3",
    gates: "statutory class 'small RPA' upper bound",
    status: "in force",
    quote: "small RPA - an RPA with a gross weight of more than 2 kg, but not more than 25 kg.",
    url: "https://www.legislation.gov.au/F1998B00220/2026-06-30/2026-06-30/text/original/epub/OEBPS/document_3/document_3.html",
  }),
  Object.freeze({
    kg: 25.0, statedValue: "25 kg (55 pounds)", statedUnit: "kg (with lb parenthetical)",
    jurisdiction: "Canada",
    document: "Canadian Aviation Regulations (SOR/96-433), Part IX", clause: "section 900.01, definition 'small remotely piloted aircraft' (upper bound)",
    gates: "statutory class boundary between small and medium RPA",
    status: "in force",
    quote: "small remotely piloted aircraft means a remotely piloted aircraft that has an operating weight of at least 250 g (0.55 pounds) but not more than 25 kg (55 pounds).",
    url: "https://laws-lois.justice.gc.ca/eng/regulations/SOR-96-433/section-900.01.html",
    note: "Canada is the jurisdiction that officially asserts 25 kg = 55 lb. The true conversion is 25 kg = 55.1156 lb; the metric figure governs.",
  }),
  Object.freeze({
    kg: 25.0, statedValue: "25 kg", statedUnit: "kg",
    jurisdiction: "EU",
    document: "Commission Delegated Regulation (EU) 2019/945, Annex Parts 16 and 17 (inserted by Commission Delegated Regulation (EU) 2020/1058)", clause: "Annex Part 16 (class C5) and Part 17 (class C6), each by reference to Part 4(1)",
    gates: "product class marking C5 / C6 -> SPECIFIC-category standard scenarios STS-01 / STS-02",
    status: "in force",
    quote: "A class C5 UAS shall comply with the requirements defined in Part 4, except those defined in paragraphs (2) and (10) of Part 4. [Part 4(1): have an MTOM of less than 25 kg, including payload, and have a maximum characteristic dimension of less than 3 m]",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32020R1058",
  }),
  Object.freeze({
    kg: 25.0, statedValue: "25 kg", statedUnit: "kg",
    jurisdiction: "EU / UK",
    document: "Commission Implementing Regulation (EU) 2019/947, consolidated as at 2025-05-01 (UK: same text as assimilated)", clause: "Article 4(1)(b)",
    gates: "ceiling of the entire OPEN category; above it the operation falls into the SPECIFIC category and needs an operational authorisation",
    status: "in force",
    quote: "Operations shall be classified as UAS operations in the 'open' category only where the following requirements are met: ... (b) the unmanned aircraft has a maximum take-off mass of less than 25 kg;",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02019R0947-20250501",
    note: "'less than' - an aircraft at exactly 25.0 kg is outside the open category.",
  }),
  Object.freeze({
    kg: 25.0, statedValue: "25 kg", statedUnit: "kg",
    jurisdiction: "EU / UK",
    document: "Commission Delegated Regulation (EU) 2019/945, Annex Part 4 (UK: class UK3)", clause: "Annex Part 4(1) - class C3",
    gates: "product class marking C3 -> subcategory A3 operation",
    status: "in force",
    quote: "have an MTOM of less than 25 kg, including payload, and have a maximum characteristic dimension of less than 3 m;",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019R0945",
    note: "C3 carries a 3 m dimension limit alongside the mass limit; inherited by C5 and C6.",
  }),
  Object.freeze({
    kg: 25.0, statedValue: "25 kg", statedUnit: "kg",
    jurisdiction: "EU / UK",
    document: "Commission Delegated Regulation (EU) 2019/945, Annex Part 5 (UK: class UK4)", clause: "Annex Part 5(1) - class C4",
    gates: "product class marking C4 -> subcategory A3 operation, manually flown model-aircraft type",
    status: "in force",
    quote: "A class C4 UAS shall comply with the following: (1) have an MTOM of less than 25 kg, including payload;",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019R0945",
  }),
  Object.freeze({
    kg: 25.0, statedValue: "25 kg", statedUnit: "kg",
    jurisdiction: "EU / UK",
    document: "Commission Implementing Regulation (EU) 2019/947, Annex Part A; and Article 20(b)", clause: "UAS.OPEN.040(4)(a); Article 20(b)",
    gates: "operation in subcategory A3 for privately built UAS and legacy non-class-marked UAS",
    status: "in force",
    quote: "has an MTOM, including payload, of less than 25 kg, in the case of a privately built UAS, or",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02019R0947-20250501",
  }),
  Object.freeze({
    kg: 25.0, statedValue: "[25 kg]", statedUnit: "kg (bracketed placeholder)",
    jurisdiction: "ICAO (model text, non-binding)",
    document: "ICAO Model UAS Regulations, Parts 101 and 102, 23 June 2020", clause: "rules 101.3(a)(2) and 101.37(a)",
    gates: "model text: ceiling of the model 'open category'",
    status: "non-binding model text",
    quote: "operations in the open category using a UA with a gross mass of [25 kg or less] on takeoff and throughout the duration of each operation under this category, including all items that are on board or otherwise attached to the aircraft and operated in accordance with Part 101.7. ... 101.37 Aircraft Mass Limits (a) A person shall not operate a UA with a gross mass of more than [25 kg].",
    url: "https://www.icao.int/sites/default/files/sp-files/safety/UA/Documents/Model%20UAS%20Regulations%20-%20Parts%20101%20and%20102.pdf",
    note: "ICAO's own description: 'Model regulations included herein are not intended to be prescriptive, mandatory, or construed in any way as to pre-empt individual States' legal structures.'",
  }),
  Object.freeze({
    kg: 49.8952, statedValue: "110 pounds", statedUnit: "lb",
    jurisdiction: "USA (FAA) - PROPOSED ONLY",
    document: "NPRM 'Normalizing Unmanned Aircraft Systems Beyond Visual Line of Sight Operations', FR document 2025-14992, published 7 August 2025", clause: "proposed Part 108 (e.g. proposed Secs. 108.405, 108.425); preamble section X.A",
    gates: "proposed intermediate weight tier for permitted and certificated Part 108 operations (package delivery, aerial survey)",
    status: "PROPOSED - no final rule exists as of 2026-09-21",
    quote: "This rule proposes three weight limits for the various categories of permitted and certificated operations (55 pounds, 110 pounds, and 1,320 pounds) to give structure to the spectrum of risk.",
    url: "https://www.federalregister.gov/documents/2025/08/07/2025-14992/normalizing-unmanned-aircraft-systems-beyond-visual-line-of-sight-operations",
  }),
  Object.freeze({
    kg: 150.0, statedValue: "150 kg", statedUnit: "kg",
    jurisdiction: "Australia",
    document: "Civil Aviation Safety Regulations 1998 (Cth), compilation No. 102", clause: "regulation 101.022, items 4 and 5",
    gates: "statutory classes 'medium RPA' and 'large RPA'",
    status: "in force",
    quote: "medium RPA - (a) an RPA with a gross weight of more than 25 kg, but not more than 150 kg; or (b) a remotely piloted airship with an envelope capacity of not more than 100 m3. large RPA - (a) a remotely piloted aeroplane with a gross weight of more than 150 kg; or (b) a remotely piloted powered parachute with a gross weight of more than 150 kg; or (c) a remotely piloted rotorcraft with a gross weight of more than 150 kg; or (d) a remotely piloted powered-lift aircraft with a gross weight of more than 150 kg; or (e) a remotely piloted airship with an envelope capacity of more than 100 m3.",
    url: "https://www.legislation.gov.au/F1998B00220/2026-06-30/2026-06-30/text/original/epub/OEBPS/document_3/document_3.html",
    note: "Airships are classed by envelope capacity (100 m3), not mass.",
  }),
  Object.freeze({
    kg: 150.0, statedValue: "150 kg", statedUnit: "kg",
    jurisdiction: "Australia",
    document: "Civil Aviation Safety Regulations 1998 (Cth), compilation No. 102", clause: "regulation 101.023(1)(a)(ii)",
    gates: "definition of 'model aircraft' (sport or recreation)",
    status: "in force",
    quote: "A model aircraft is an aircraft (other than a balloon or a kite) that does not carry a person: (a) if the aircraft: (i) is being operated for the purpose of sport or recreation; and (ii) has a gross weight of not more than 150 kg;",
    url: "https://www.legislation.gov.au/F1998B00220/2026-06-30/2026-06-30/text/original/epub/OEBPS/document_3/document_3.html",
  }),
  Object.freeze({
    kg: 150.0, statedValue: "150 kg (331 pounds)", statedUnit: "kg (with lb parenthetical)",
    jurisdiction: "Canada",
    document: "Canadian Aviation Regulations (SOR/96-433), Part IX, as amended by SOR/2025-70", clause: "section 900.01, definition 'medium remotely piloted aircraft'; applicability at section 901.01",
    gates: "statutory class 'medium RPA' - brings 25-150 kg inside the routine Subpart 901 regime",
    status: "in force",
    quote: "medium remotely piloted aircraft means a remotely piloted aircraft that has an operating weight of more than 25 kg (55 pounds) but not more than 150 kg (331 pounds). ... 901.01 This Subpart applies in respect of the operation of remotely piloted aircraft systems that include a small remotely piloted aircraft or a medium remotely piloted aircraft.",
    url: "https://laws-lois.justice.gc.ca/eng/regulations/SOR-96-433/section-900.01.html",
    note: "150 kg = 330.6934 lb; Canada rounds to 331. Clearest counter-example to '25 kg is a universal ceiling'.",
  }),
  Object.freeze({
    kg: 150.0, statedValue: "150 kg", statedUnit: "kg",
    jurisdiction: "NATO (doctrine, not law)",
    document: "JAPCC UAS CONEMP (2010), reproducing 'NATO UAS Classification Guide. September 2009 JCGUAV meeting'", clause: "paragraphs 2.2.2.1 and 2.2.2.2",
    gates: "Class I / Class II boundary; also stated as the cut-off below which NATO certification standards do not apply",
    status: "doctrine; underlying JCGUAV meeting paper not obtained",
    quote: "2.2.2.1 CLASS I: Less than 150 kg (further divided down based on altitude). Under 150 kg the NATO certification Standards do not apply. 2.2.2.2 CLASS II: 150 kg to 600 kg. 600 kg is the maximum weight for the Light Sport Aircraft in civil terms, but over the 150 kg that is in use for NATO certification.",
    url: "https://www.japcc.org/wp-content/uploads/UAS_CONEMP.pdf",
  }),
  Object.freeze({
    kg: 150.0, statedValue: "150 kg", statedUnit: "kg",
    jurisdiction: "NATO (standardization agreement)",
    document: "STANAG 4703 / AEP-83, Light Unmanned Aircraft Systems Airworthiness Requirements (NATO UNCLASSIFIED)", clause: "section 1, Scope",
    gates: "applicability of military airworthiness certification requirements for fixed-wing light UAS",
    status: "in force (edition as hosted by UK MOD)",
    quote: "This document contains the minimum set of technical airworthiness requirements intended for the airworthiness certification of fixed-wing Light UAS with a maximum take-off weight not greater than 150 kg and an impact energy greater than 66 J (49 ft-lb) that intend to regularly operate in non-segregated airspace.",
    url: "https://assets.publishing.service.gov.uk/media/5a7ec5c940f0b62305b83155/20140916-STANAG-4703_AEP-83_A__1_.pdf",
    note: "The LOWER bound of applicability is an energy (66 J), not a mass.",
  }),
  Object.freeze({
    kg: 150.0, statedValue: "150 Kg", statedUnit: "kg",
    jurisdiction: "NATO (standardization agreement, DRAFT edition)",
    document: "STANAG 4671, UAV Systems Airworthiness Requirements (USAR), draft Edition 1, doc. PFP(NNAG-JCGUAV)D(2007)0002", clause: "USAR.1 Applicability, paragraph (a)",
    gates: "applicability of military airworthiness certification requirements for fixed-wing UAV systems",
    status: "DRAFT Edition 1, obtained from a private host - provenance caveat",
    quote: "This airworthiness code is primarily applicable to fixed wing UAV Systems of maximum take-off weight of more than 150 Kg and less than 20,000 kg. It may also be applied to UAV Systems of any other maximum take-off weight where considered applicable by the Certifying Authority.",
    url: "https://www.dror-aero.com/link/usar_edition_1.pdf",
  }),
  Object.freeze({
    kg: 598.7419, statedValue: "1,320 pounds (600 kilograms)", statedUnit: "lb (with kg parenthetical)",
    jurisdiction: "USA (FAA) - PROPOSED ONLY",
    document: "NPRM 'Normalizing Unmanned Aircraft Systems Beyond Visual Line of Sight Operations', FR document 2025-14992, published 7 August 2025", clause: "proposed Sec. 108.805(b)",
    gates: "proposed ceiling for airworthiness acceptance and operation under Part 108 (BVLOS)",
    status: "PROPOSED - no final rule exists as of 2026-09-21",
    quote: "The unmanned aircraft must, unless otherwise authorized by the Administrator-- (a) Have a wingspan or lateral span not to exceed 25 feet (7 meters); (b) Not have a combined total weight greater than 1,320 pounds (600 kilograms), including anything attached to or carried by the aircraft; and (c) Be limited not to exceed 87 knots ground speed.",
    url: "https://www.federalregister.gov/documents/2025/08/07/2025-14992/normalizing-unmanned-aircraft-systems-beyond-visual-line-of-sight-operations",
    note: "1,320 lb is actually 598.74 kg; the NPRM rounds to 600 kg. Stated basis: BVLOS ARC recommendations and JARUS kinetic-energy limits.",
  }),
  Object.freeze({
    kg: 600.0, statedValue: "600 kg", statedUnit: "kg",
    jurisdiction: "NATO (doctrine, not law)",
    document: "JAPCC UAS CONEMP (2010), Table 1 and paragraphs 2.2.2.2-2.2.2.3", clause: "paragraphs 2.2.2.2 and 2.2.2.3",
    gates: "Class II / Class III boundary",
    status: "doctrine",
    quote: "2.2.2.2 CLASS II: 150 kg to 600 kg. ... 2.2.2.3 CLASS III: More than 600 kg (further divided based on altitude). Operates at the higher altitudes and with the higher speeds, range, endurance and size.",
    url: "https://www.japcc.org/wp-content/uploads/UAS_CONEMP.pdf",
  }),
  Object.freeze({
    kg: 20000.0, statedValue: "20,000 kg", statedUnit: "kg",
    jurisdiction: "NATO (standardization agreement, DRAFT edition)",
    document: "STANAG 4671, UAV Systems Airworthiness Requirements (USAR), draft Edition 1", clause: "USAR.1 Applicability, paragraph (a)",
    gates: "upper bound of USAR applicability",
    status: "DRAFT Edition 1 - provenance caveat",
    quote: "This airworthiness code is primarily applicable to fixed wing UAV Systems of maximum take-off weight of more than 150 Kg and less than 20,000 kg.",
    url: "https://www.dror-aero.com/link/usar_edition_1.pdf",
  }),
]);

export const JURISDICTIONS = Object.freeze(
  [...new Set(THRESHOLDS.map((t) => t.jurisdiction))].sort());

/* Triggers that are NOT a mass, and will mis-bin an aircraft if a
   classifier pretends mass is sufficient. Each is sourced. */
export const NON_MASS_TRIGGERS = Object.freeze([
  Object.freeze({ id: "impact80J", label: "80 J impact energy",
    jurisdiction: "EU / UK", gates: "operator registration; C1 alternative to the 900 g limit",
    note: "C1 is not simply 'the 900 g class' — 900 g is the alternative to an 80 J head-impact showing, so a compliant C1 aircraft may exceed it." }),
  Object.freeze({ id: "camera", label: "carries a personal-data sensor",
    jurisdiction: "EU", gates: "operator registration AT ANY MASS",
    note: "A 150 g EU camera drone still registers. The UK replaced this test with a 100 g mass test, in force 1 Jan 2026." }),
  Object.freeze({ id: "dimension3m", label: "3 m characteristic dimension",
    jurisdiction: "EU / UK", gates: "C3, C5, C6; the only physical number in the CERTIFIED trigger",
    note: "C3 is not just a 25 kg class — it also carries a sub-3 m dimension limit, inherited by C5 and C6." }),
  Object.freeze({ id: "impact66J", label: "66 J impact energy",
    jurisdiction: "NATO", gates: "lower bound of STANAG 4703 / AEP-83 airworthiness", note: null }),
  Object.freeze({ id: "bvlos", label: "beyond visual line of sight",
    jurisdiction: "EU / UK", gates: "SPECIFIC category, which has NO upper mass limit",
    note: "SPECIFIC is not a mass band: Art. 5(1) fires on any failure of Art. 4, so BVLOS at 400 g puts an operator there." }),
  Object.freeze({ id: "purpose", label: "recreational vs commercial",
    jurisdiction: "USA", gates: "whether the 0.55 lb registration exemption exists at all",
    note: "14 CFR 48.15(b) applies only to aircraft operated exclusively under 49 USC 44809. Flown commercially under Part 107 the exemption evaporates at any mass." }),
]);

/* Words the industry uses that carry NO legal force anywhere that could
   be sourced. The tool may show them as informal labels; it must never
   present them as a regulatory class. */
export const CONVENTION_ONLY = Object.freeze([
  Object.freeze({ word: "nano", finding: "Appears in no primary document sourced, including the real NATO table." }),
  Object.freeze({ word: "heavy-lift", finding: "No legal definition found in any jurisdiction surveyed." }),
  Object.freeze({ word: "tactical", finding: "Nothing in civil law. In NATO doctrine it means Class II, 150-600 kg — not a small drone." }),
  Object.freeze({ word: "mini", finding: "NATO doctrine only (2-20 kg); no civil statute uses it." }),
]);
