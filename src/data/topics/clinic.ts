// "Bed 4, before rounds", a clinician's-eye case review: the working diagnosis, the vitals
// trend, the affected lobe, the differential, and the onset timeline. A healthcare profession
// demo; exercises the new diagram (anatomy) + plot (vitals) alongside compare/kpi/timeline.
// Illustrative data only, confidence is honest (a clinical impression, not a verified fact).
import type { ConversationSpec } from '../conversation';

export const clinic: ConversationSpec = {
  id: 'clinic',
  workspace: 'Bed 4 · pre-rounds',
  title: 'Bed 4, before rounds',
  sub: 'The overnight picture on Mr. Alvarez, vitals, imaging, and the differential.',
  opener:
    'Fever curve is breaking and the right lower lobe is the story. Here it is before you round.',
  switchSay: "Let's pull up bed 4.",
  gather: 'Reading the chart, the vitals feed, and the overnight radiology read',
  found: 'The picture points to a right-lower-lobe pneumonia that’s starting to turn.',
  tint: '#5aa9e6',
  context: [
    { name: 'Vitals feed · 48h', color: 'var(--presence-soft)' },
    { name: 'CXR read (overnight)', color: 'var(--insight)' },
    { name: 'Labs · CBC, CRP', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'impression',
      num: '1',
      delay: 0,
      props: {
        title: 'Working dx: right-lower-lobe pneumonia',
        stat: 'CURB-65 2',
        delta: 'moderate',
        deltaDir: 'up',
        conf: 'inferred',
        summary:
          'Focal consolidation on CXR, productive cough, CRP 142, fits CAP. Inpatient-appropriate.',
        sources: [{ file: 'CXR read', loc: 'overnight' }],
      },
    },
    {
      type: 'kpi',
      col: 8,
      delay: 90,
      props: {
        title: 'Vitals · most recent',
        icon: 'alert',
        iconColor: 'var(--presence)',
        kpis: [
          { val: '37.9°', label: 'temp', color: 'var(--insight)' },
          { val: '92', label: 'HR' },
          { val: '118/74', label: 'BP' },
          { val: '94%', label: 'SpO₂ (2L)', color: 'var(--warning)' },
          { val: '20', label: 'RR' },
        ],
        footer: 'Trending the right way overnight, temp down from 39.4°, HR down from 112.',
      },
    },
    {
      type: 'plot',
      col: 8,
      delay: 180,
      props: {
        title: 'Temperature & SpO₂ · last 48h',
        icon: 'chart',
        iconColor: 'var(--presence)',
        xLabel: 'hours since admit',
        yLabel: '°C / SpO₂(%·/10)',
        xDomain: [0, 48],
        yDomain: [36, 40],
        origin: false,
        curves: [
          {
            label: 'temp (°C)',
            color: 'var(--warning)',
            points: [
              { x: 0, y: 39.4 },
              { x: 8, y: 39.6 },
              { x: 16, y: 39.1 },
              { x: 24, y: 38.7 },
              { x: 32, y: 38.3 },
              { x: 40, y: 38.0 },
              { x: 48, y: 37.9 },
            ],
          },
          {
            label: 'SpO₂ (%/10, on O₂ from 12h)',
            color: 'var(--insight)',
            dashed: true,
            points: [
              { x: 0, y: 38.8 },
              { x: 12, y: 39.0 },
              { x: 24, y: 39.2 },
              { x: 36, y: 39.3 },
              { x: 48, y: 39.4 },
            ],
          },
        ],
        markers: [{ x: 12, y: 39.0, label: 'started 2L O₂', color: 'var(--text-muted)' }],
        footer:
          'Fever curve is breaking after the first antibiotic dose; oxygenation steady on 2 L.',
      },
    },
    {
      type: 'diagram',
      col: 4,
      delay: 260,
      props: {
        title: 'Where it is',
        icon: 'eye',
        iconColor: 'var(--presence)',
        ratio: 0.92,
        shapes: [
          {
            kind: 'path',
            d: 'M50 6 C 30 6 26 20 26 40 L 28 86 L 72 86 L 74 40 C 74 20 70 6 50 6 Z',
            color: 'var(--text-muted)',
          },
          { kind: 'circle', cx: 40, cy: 44, r: 13, color: 'var(--presence)' },
          { kind: 'circle', cx: 62, cy: 44, r: 13, color: 'var(--presence)' },
          { kind: 'circle', cx: 64, cy: 54, r: 6, color: 'var(--danger)', fill: 'var(--danger)' },
          { kind: 'line', x1: 50, y1: 8, x2: 50, y2: 30, color: 'var(--text-muted)' },
        ],
        labels: [
          { x: 50, y: 16, text: 'trachea', side: 'right', color: 'var(--text-muted)' },
          { x: 64, y: 54, text: 'RLL consolidation', side: 'bottom', color: 'var(--danger)' },
        ],
        footer:
          'Consolidation is confined to the right lower lobe, matches the focal crackles on exam.',
      },
    },
    {
      type: 'compare',
      col: 7,
      delay: 320,
      props: {
        eyebrow: 'Differential, what else fits, and why not',
        options: [
          { name: 'Pneumonia (CAP)', sub: 'working dx', pick: true },
          { name: 'CHF exacerbation' },
          { name: 'Pulmonary embolism' },
        ],
        criteria: [
          {
            label: 'Imaging',
            cells: [
              { v: 'Focal consolidation', win: true },
              { v: 'Bilateral, vascular' },
              { v: 'Often normal CXR' },
            ],
          },
          {
            label: 'Fever / CRP↑',
            cells: [{ v: 'Yes', win: true }, { v: 'No' }, { v: 'Low-grade' }],
          },
          {
            label: 'Onset',
            cells: [{ v: 'Days', win: true }, { v: 'Days–weeks' }, { v: 'Sudden' }],
          },
          {
            label: 'D-dimer / risk',
            cells: [{ v: 'n/a' }, { v: 'BNP↑' }, { v: 'Wells low', win: false }],
          },
        ],
        recommendation:
          '<b>CAP fits this picture best.</b> No orthopnea/edema and a normal BNP argue against CHF; low Wells + no sudden hypoxia make PE unlikely — the overnight plan holds the CTPA unless the picture changes.',
      },
    },
    {
      type: 'timeline',
      col: 5,
      delay: 380,
      props: {
        eyebrow: 'Course so far',
        events: [
          { time: 'Day −3', title: 'Productive cough, malaise', color: 'var(--text-muted)' },
          {
            time: 'Day 0 · 02:10',
            title: 'ED: T 39.4°, SpO₂ 90%',
            tag: 'admit',
            color: 'var(--warning)',
          },
          {
            time: 'Day 0 · 03:00',
            title: 'First antibiotic dose',
            tag: 'started',
            color: 'var(--insight)',
          },
          { time: 'Day 1', title: 'Fever breaking, O₂ weaning', color: 'var(--insight)' },
        ],
      },
    },
    {
      type: 'clinicaltimeline',
      col: 7,
      delay: 660,
      props: {
        title: 'Admission timeline, Mr. Alvarez',
        events: [
          {
            date: '48h ago',
            type: 'symptom',
            label: 'Fever 39.1°C, productive cough, dyspnoea on exertion',
          },
          { date: '36h ago', type: 'visit', label: 'ED presentation, SpO₂ 91% on room air' },
          { date: '34h ago', type: 'test', label: 'CXR ordered, right lower lobe infiltrate' },
          { date: '34h ago', type: 'test', label: 'Blood cultures × 2, CBC, CRP, procalcitonin' },
          {
            date: '30h ago',
            type: 'result',
            label: 'WBC 14.2, CRP 187, procalcitonin 2.1, bacterial picture',
          },
          {
            date: '29h ago',
            type: 'diagnosis',
            label: 'Community-acquired pneumonia, RLL, admitted',
          },
          {
            date: '28h ago',
            type: 'treatment',
            label: 'IV amoxicillin-clavulanate started, O₂ via NRB mask',
          },
          { date: 'Now', type: 'result', label: 'Fever breaking, SpO₂ 96% on 2L nasal cannula' },
        ],
      },
    },
    {
      type: 'medicationschedule',
      col: 5,
      delay: 750,
      props: {
        title: 'Current medication orders',
        medications: [
          {
            name: 'Amoxicillin-clavulanate',
            dose: '1.2g IV',
            frequency: 'every 8 hours',
            times: ['6:00 AM', '2:00 PM', '10:00 PM'],
            withFood: false,
            notes: 'Switch to oral when tolerating',
          },
          {
            name: 'Paracetamol',
            dose: '1g IV/oral',
            frequency: 'every 6 hours PRN',
            times: ['6:00 AM', '12:00 PM', '6:00 PM', '12:00 AM'],
            withFood: false,
            notes: 'For fever > 38.5°C only',
          },
        ],
      },
    },
    {
      type: 'clearancematrix',
      col: 12,
      delay: 480,
      props: {
        title: 'Common over-the-counter combos',
        icon: 'shield',
        iconColor: 'var(--insight)',
        rows: ['Ibuprofen', 'Acetaminophen', 'Aspirin', 'Antihistamine'],
        columns: [
          'With alcohol',
          'On an empty stomach',
          'During pregnancy',
          'With a blood thinner',
        ],
        cells: [
          {
            row: 'Ibuprofen',
            col: 'With alcohol',
            level: 'caution',
            reason: 'Both irritate the stomach lining — space them out.',
          },
          {
            row: 'Ibuprofen',
            col: 'On an empty stomach',
            level: 'caution',
            reason: 'Take with food to limit stomach upset.',
          },
          {
            row: 'Ibuprofen',
            col: 'During pregnancy',
            level: 'avoid',
            reason: 'Not advised in the third trimester.',
          },
          {
            row: 'Ibuprofen',
            col: 'With a blood thinner',
            level: 'avoid',
            reason: 'Raises bleeding risk markedly.',
          },
          {
            row: 'Acetaminophen',
            col: 'With alcohol',
            level: 'caution',
            reason: 'Heavy drinking strains the liver — keep doses low.',
          },
          {
            row: 'Acetaminophen',
            col: 'On an empty stomach',
            level: 'safe',
            reason: 'Gentle on the stomach either way.',
          },
          {
            row: 'Acetaminophen',
            col: 'During pregnancy',
            level: 'safe',
            reason: 'Generally the preferred pain reliever.',
          },
          {
            row: 'Acetaminophen',
            col: 'With a blood thinner',
            level: 'caution',
            reason: 'High regular use can nudge thinner levels.',
          },
          {
            row: 'Aspirin',
            col: 'With alcohol',
            level: 'avoid',
            reason: 'Compounds stomach-bleeding risk.',
          },
          {
            row: 'Aspirin',
            col: 'On an empty stomach',
            level: 'caution',
            reason: 'Take with food or water.',
          },
          {
            row: 'Aspirin',
            col: 'During pregnancy',
            level: 'avoid',
            reason: 'Avoid unless a clinician prescribes low-dose.',
          },
          {
            row: 'Aspirin',
            col: 'With a blood thinner',
            level: 'avoid',
            reason: 'Doubles up on bleeding risk.',
          },
          {
            row: 'Antihistamine',
            col: 'With alcohol',
            level: 'caution',
            reason: 'Drowsiness adds up — do not drive.',
          },
          { row: 'Antihistamine', col: 'On an empty stomach', level: 'safe' },
          {
            row: 'Antihistamine',
            col: 'With a blood thinner',
            level: 'safe',
            reason: 'No notable interaction.',
          },
        ],
        footer:
          'General guidance, not medical advice — unrated pairings read “check a pro,” and your pharmacist can confirm for your situation.',
      },
    },
    {
      type: 'anatomyfigure',
      col: 8,
      id: 'clinic-anatomyfigure',
      delay: 120,
      props: {
        title: 'Anatomy of the heart',
        icon: 'spark',
        iconColor: 'var(--danger)',
        organ: 'heart',
        view: 'anterior',
        pins: [
          {
            x: 33,
            y: 40,
            label: 'Right atrium',
            note: 'Receives deoxygenated blood from the body via the venae cavae.',
          },
          {
            x: 67,
            y: 40,
            label: 'Left atrium',
            note: 'Receives oxygen-rich blood returning from the lungs.',
          },
          {
            x: 36,
            y: 66,
            label: 'Right ventricle',
            note: 'Pumps blood to the lungs through the pulmonary artery.',
          },
          {
            x: 63,
            y: 66,
            label: 'Left ventricle',
            note: 'The thickest chamber — drives blood out to the whole body.',
          },
          {
            x: 50,
            y: 18,
            label: 'Aorta',
            note: 'The main artery carrying oxygenated blood from the left ventricle.',
          },
        ],
        caption: 'The four chambers and the great vessels, viewed from the front.',
      },
    },
    {
      type: 'odontogram',
      col: 8,
      id: 'clinic-odontogram-adult',
      delay: 360,
      props: {
        title: 'Adult dental chart',
        icon: 'doc',
        iconColor: 'var(--presence)',
        system: 'universal',
        teeth: [
          { n: 3, status: 'filling', surface: 'O' },
          { n: 14, status: 'filling', surface: 'MOD' },
          { n: 19, status: 'crown', note: 'porcelain-fused-to-metal' },
          { n: 30, status: 'missing' },
          { n: 31, status: 'implant', note: 'titanium fixture, placed 2024' },
        ],
        caption: 'Universal numbering: teeth 1–16 across the upper arch, 17–32 across the lower.',
      },
    },
    {
      type: 'ecgstrip',
      col: 12,
      id: 'ecg',
      delay: 150,
      props: {
        title: 'Rhythm strip · lead II',
        iconColor: 'var(--danger)',
        rateBpm: 72,
        rhythm: 'Normal sinus rhythm',
        gridMs: 40,
        intervals: [
          { label: 'PR', fromMs: 125, toMs: 285 },
          { label: 'QRS', fromMs: 300, toMs: 390 },
          { label: 'QT', fromMs: 300, toMs: 700 },
        ],
        caption:
          'Regular, narrow-complex, every P followed by a QRS — sinus at 72. PR 160 ms, QRS 90 ms, QT 400 ms all within normal limits.',
      },
    },
    {
      type: 'vitalstrip',
      col: 12,
      id: 'monitor',
      delay: 210,
      props: {
        title: 'Bedside monitor',
        iconColor: 'var(--presence)',
        windowLabel: 'last 30 min',
        channels: [
          {
            label: 'HR',
            unit: 'bpm',
            normal: [60, 100],
            series: [108, 104, 99, 96, 94, 92, 90, 88, 89, 92],
          },
          {
            label: 'BP (sys)',
            unit: 'mmHg',
            normal: [90, 140],
            series: [126, 124, 122, 121, 120, 119, 118, 118, 117, 118],
          },
          {
            label: 'SpO₂',
            unit: '%',
            color: 'var(--warning)',
            normal: [94, 100],
            series: [96, 95, 95, 94, 93, 92, 92, 93, 92, 91],
          },
          {
            label: 'RR',
            unit: '/min',
            normal: [12, 20],
            series: [22, 21, 21, 20, 20, 19, 20, 19, 20, 20],
          },
        ],
        caption:
          'SpO₂ has slipped to 91% on 2 L — below the 94–100% band and flagged. HR settling back into range as the fever breaks.',
      },
    },
    {
      type: 'careplan',
      col: 12,
      id: 'careplan',
      delay: 560,
      props: {
        title: 'Care plan — day 1 post-op',
        icon: 'shield',
        iconColor: 'var(--presence)',
        caption: 'Med-surg · evening shift handoff',
        entries: [
          {
            assessment: 'Rates pain 7/10 at the incision, guarding on movement',
            diagnosis: 'Acute pain related to surgical incision',
            goal: 'Pain reported ≤ 3/10 within 24 hours',
            interventions: [
              'Give scheduled analgesia and assess effect at 30 min',
              'Reposition and support the incision before activity',
              'Reassess pain score every 4 hours',
            ],
            rationale:
              'Multimodal, scheduled analgesia controls pain better than PRN-only dosing and supports early mobility.',
            status: 'partial',
          },
          {
            assessment: 'Clean, dry surgical wound; indwelling IV and urinary catheter in place',
            diagnosis: 'Risk for infection related to surgical wound and invasive lines',
            goal: 'Remains afebrile with no signs of wound or line infection',
            interventions: [
              'Hand hygiene and aseptic technique at every contact',
              'Inspect wound and line sites each shift for redness or drainage',
              'Remove the urinary catheter as soon as clinically appropriate',
            ],
            rationale:
              'Early line removal and daily site checks catch infection before it spreads and shorten exposure.',
            status: 'ongoing',
          },
          {
            assessment: 'Steady on standby-assist; lungs clear, encouraged to walk',
            diagnosis: 'Risk for impaired mobility related to post-operative pain',
            goal: 'Walks the hallway with standby assist by day 2',
            interventions: [
              'Pre-medicate for pain 30 min before ambulation',
              'Assist out of bed three times daily',
              'Coach incentive spirometry hourly while awake',
            ],
            rationale: 'Early ambulation lowers the risk of pneumonia and venous thromboembolism.',
            status: 'met',
          },
        ],
        footer: 'Reassess each goal at the next shift and update the status as outcomes are met.',
      },
    },
    {
      type: 'triageboard',
      col: 12,
      delay: 620,
      props: {
        title: 'Meanwhile, down in the ED',
        icon: 'alert',
        iconColor: 'var(--danger)',
        patients: [
          {
            chiefComplaint: 'Crushing chest pain, radiating to left arm',
            esiLevel: 1,
            vitals: [
              { label: 'HR', value: '118', abnormal: true },
              { label: 'BP', value: '88/56', abnormal: true },
              { label: 'SpO₂', value: '91%', abnormal: true },
            ],
            waitTime: 'being seen',
          },
          {
            chiefComplaint: 'Fall from ladder, deformed forearm',
            esiLevel: 2,
            vitals: [
              { label: 'HR', value: '96' },
              { label: 'Pain', value: '8/10', abnormal: true },
            ],
            waitTime: '6 min',
          },
          {
            chiefComplaint: 'Fever and cough, 3 days',
            esiLevel: 3,
            vitals: [{ label: 'Temp', value: '38.9°C', abnormal: true }],
            waitTime: '42 min',
          },
          {
            chiefComplaint: 'Twisted ankle playing soccer',
            esiLevel: 4,
            waitTime: '1h 10m',
          },
          {
            chiefComplaint: 'Refill request, ran out of a maintenance medication',
            esiLevel: 5,
            waitTime: '1h 45m',
          },
        ],
        footer:
          'The chest-pain patient jumped the queue the moment they walked in, everyone else holds their spot.',
      },
    },
    {
      type: 'mentalhealthscreen',
      col: 12,
      id: 'phq9',
      delay: 700,
      props: {
        title: 'Routine screen on admission — Mr. Alvarez',
        icon: 'chat',
        iconColor: 'var(--presence)',
        instrument: 'PHQ-9',
        items: [
          {
            prompt: 'Little interest or pleasure in doing things',
            score: 1,
            anchor: 'Several days',
          },
          { prompt: 'Feeling down, depressed, or hopeless', score: 1, anchor: 'Several days' },
          {
            prompt: 'Trouble falling or staying asleep, or sleeping too much',
            score: 2,
            anchor: 'More than half the days',
          },
          {
            prompt: 'Feeling tired or having little energy',
            score: 2,
            anchor: 'More than half the days',
          },
          { prompt: 'Poor appetite or overeating', score: 1, anchor: 'Several days' },
          {
            prompt: 'Feeling bad about yourself, or that you are a failure',
            score: 0,
            anchor: 'Not at all',
          },
          { prompt: 'Trouble concentrating on things', score: 1, anchor: 'Several days' },
          {
            prompt: 'Moving or speaking slowly, or being fidgety/restless',
            score: 0,
            anchor: 'Not at all',
          },
          {
            prompt: 'Thoughts that you would be better off dead',
            score: 0,
            anchor: 'Not at all',
          },
        ],
        total: 8,
        maxTotal: 27,
        bands: [
          { label: 'Minimal', range: [0, 4], tone: 'ok' },
          { label: 'Mild', range: [5, 9], tone: 'mild' },
          { label: 'Moderate', range: [10, 14], tone: 'moderate' },
          { label: 'Mod. severe', range: [15, 19], tone: 'moderate' },
          { label: 'Severe', range: [20, 27], tone: 'severe' },
        ],
        footer:
          'Sleep and fatigue are likely the acute admission talking, not a standalone mood concern, worth a re-screen after discharge.',
      },
    },
  ],
  proof: null,
  extras: {},

  group: 'health',
  intents: {
    impression: {
      kind: 'spotlight',
      spotId: 'impression',
      say: 'Working diagnosis: a right-lower-lobe pneumonia, CURB-65 of 2, inpatient-appropriate.',
    },
  },
  tryChip: { label: 'Summarize bed 4 before rounds', route: 'topic:clinic' },
  suggests: [
    { label: 'Walk the differential', icon: 'proof', route: 'topic:clinic', lead: 'Try' },
    { label: 'Show the vitals trend', icon: 'chart', route: 'topic:clinic' },
    { label: 'Read my blood test', icon: 'doc', route: 'topic:labs' },
    { label: 'My child has a fever', icon: 'alert', route: 'topic:symptom' },
  ],
  keywords: [
    {
      test: /\brounds\b|differential|working dx|\bpneumonia\b|\bcurb-?65\b|the chart|my patient|pre-?rounds|consolidation/,
      route: 'topic:clinic',
    },
  ],
};
