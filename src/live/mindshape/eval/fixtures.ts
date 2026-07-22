// fixtures.ts — ~60–90s realistic ramble transcripts for the mindshape eval.
// Fixture #1 is the canonical Seattle/Maya/Dad scenario from the mockup with a
// reference shape so the judge can score coverage vs a known-good answer.
import type { MindShapeSpec } from '../types';

/** A partial atom for reference shapes — status/confidence are optional because the
 *  reference is only used as JSON context in the judge prompt, not rendered. */
export type ReferenceAtom = Pick<MindShapeSpec['atoms'][number], 'id' | 'kind' | 'label' | 'quote'>;

/** A reference theme — how a human would name the clusters from this person's own words. */
export type ReferenceCluster = Pick<
  NonNullable<MindShapeSpec['clusters']>[number],
  'id' | 'label' | 'atomIds'
>;

export interface ReferenceShape {
  center?: string;
  atoms?: ReferenceAtom[];
  links?: Partial<MindShapeSpec['links'][number]>[];
  clusters?: ReferenceCluster[];
  unsaid?: MindShapeSpec['unsaid'];
}

export interface MindShapeFixture {
  id: string;
  name: string;
  /** Raw STT-style transcript — as the user would speak, minimal punctuation. */
  transcript: string;
  /** Optional reference shape for fixture #1 to score accuracy against. */
  referenceShape?: ReferenceShape;
}

export const FIXTURES: MindShapeFixture[] = [
  {
    id: 'f01',
    name: 'Seattle offer vs family',
    transcript:
      "okay so there's this offer in Seattle it's more money a lot more but Maya just started her new school and she finally has friends and i keep telling myself it's about the career but honestly i think i'm just scared of staying still my lease is up in March anyway and Dad's not getting any younger i'd be further from him i don't know is it even the right time or am i just running",
    referenceShape: {
      center: 'Is it the right time — or am I just running?',
      atoms: [
        {
          id: 'seattle',
          kind: 'option',
          label: 'Take the Seattle offer',
          quote: "there's this offer in Seattle it's more money a lot more",
        },
        {
          id: 'maya',
          kind: 'person',
          label: 'Maya',
          quote: 'Maya just started her new school and she finally has friends',
        },
        {
          id: 'money',
          kind: 'want',
          label: 'More money / career',
          quote: "it's more money a lot more",
        },
        {
          id: 'scared',
          kind: 'fear',
          label: 'Scared of staying still',
          quote: "i think i'm just scared of staying still",
        },
        {
          id: 'lease',
          kind: 'constraint',
          label: 'Lease up in March',
          quote: 'my lease is up in March anyway',
        },
        { id: 'dad', kind: 'person', label: 'Dad (aging)', quote: "Dad's not getting any younger" },
        {
          id: 'further',
          kind: 'open_loop',
          label: 'Being further from Dad',
          quote: "i'd be further from him",
        },
        {
          id: 'rt',
          kind: 'open_loop',
          label: 'Is it the right time?',
          quote: 'is it even the right time or am i just running',
        },
      ],
      links: [
        { from: 'money', to: 'scared', kind: 'tensions', label: 'pulls against' },
        { from: 'seattle', to: 'maya', kind: 'tensions', label: 'but' },
      ],
      // Themes named the way this person would name them — never generic buckets.
      clusters: [
        { id: 'offer', label: 'The Seattle offer', atomIds: ['seattle', 'money'] },
        { id: 'mayaschool', label: "Maya's new school", atomIds: ['maya'] },
        { id: 'dadaging', label: 'Dad getting older', atomIds: ['dad', 'further'] },
        { id: 'running', label: 'Am I just running?', atomIds: ['scared', 'rt', 'lease'] },
      ],
      unsaid: {
        label: "Maybe this isn't about the job",
        why: 'She keeps framing it as career but circles back to fear — the job might be an escape.',
        confidence: 'maybe',
      },
    },
  },
  {
    id: 'f02',
    name: 'Long-term relationship flatness',
    transcript:
      "so me and Jake have been together for three years and i love him i do but i keep feeling like something's missing i can't even name what it is like he's kind and stable and my friends all love him and my mom loves him but when i imagine five years from now i feel sort of flat i don't know if that's just how long-term relationships are or if that's a sign you know and i don't want to blow up something good because of some vague feeling but i also don't want to spend five more years wondering if i'm in the right place",
  },
  {
    id: 'f03',
    name: 'Quit consulting to start something',
    transcript:
      "i've been in consulting for seven years and i'm good at it but i dread Sunday nights and i've been thinking about starting my own thing i have this idea for a platform for independent educators and i know the market there's genuine demand but i have a mortgage and my partner just left their job to go back to school so the timing is terrible and i'm also afraid that once i leave i won't be able to get back in if it doesn't work out and the worst part is i'm not even sure if i want the startup life or if i'm just bored and looking for a reason to leave",
  },
  {
    id: 'f04',
    name: 'Surgery decision vs alternative approach',
    transcript:
      "my doctor wants me to have the surgery this summer and i know rationally it's the right call the numbers are clear but i had a really bad experience with anesthesia before and i've been reading about this alternative approach and some people have had really good results with it and i keep going back and forth and my sister thinks i'm overthinking it but she's not the one who has to go under and then there's the recovery time i'd miss at least six weeks of work and we're launching a new product in August so the timing is really bad i just don't know what the right call is here",
  },
  {
    id: 'f05',
    name: 'Aging parent caregiving',
    transcript:
      "mom is getting to the point where she probably can't live alone anymore and my brother and i have been talking about it and we both agree she shouldn't be in a facility if we can help it but he lives in Portland and i'm the one who's local so it would really be me doing it and my apartment is a one-bedroom i'd have to move and i actually have the space in my house but my partner is not thrilled about it and i totally get that and i don't want to force something that makes our home feel tense but i also can't just leave her and there's nobody else",
  },
  {
    id: 'f06',
    name: 'Investing a windfall',
    transcript:
      "so i have this money sitting there from when i sold my company shares and i know i should invest it properly but every time i try to figure out the right approach i get overwhelmed there's the market risk obviously and i keep reading about how housing is a better hedge and a friend of mine wants me to go in on a building with him which sounds exciting but also terrifying because i've never owned property before and i don't know if i trust myself to make the right call with that kind of money and i keep putting it off but it's just sitting there doing nothing and that feels wrong too",
  },
  {
    id: 'f07',
    name: 'The book I keep not writing',
    transcript:
      "okay so i've been wanting to write this book for literally five years and i have notes everywhere and i know the story i want to tell and people keep telling me i should just do it but every time i try to sit down and actually write i find reasons not to and i think the real problem is i'm afraid it won't be as good as it is in my head and then it's out in the world and it's just this mediocre thing and then there's the time commitment like i have a full-time job and two kids and where do you even carve out the time and i keep telling myself after this project ships or after the summer but it's always something",
  },
  {
    id: 'f08',
    name: 'Friendship rupture after harsh comment',
    transcript:
      "so my best friend from college Sarah said something to me at dinner last month and i can't stop thinking about it she basically implied that i've changed and not in a good way and i've been replaying it ever since and i think there's some truth in it but i also think she was projecting some of her own stuff onto me and i genuinely don't know whether to bring it up or just let it go because every time i bring something up with Sarah it turns into this whole thing and we don't talk for weeks and i don't want that but i also don't want to just swallow it forever because then it just festers",
  },
  {
    id: 'f09',
    name: 'Promotion that took over my life',
    transcript:
      "i got promoted in February and i was so excited about it and now i'm working sixty hour weeks and my kids barely see me during the week and my wife is picking up all the slack and last week my son asked me if i even like my job anymore and that really hit me hard but i also feel this huge responsibility to the team i now manage they're depending on me and i've worked really hard to get here and walking back the scope of the role would feel like failure and something has to change i just don't know what that looks like without giving up what i've built",
  },
  {
    id: 'f10',
    name: 'PhD vs industry offers',
    transcript:
      "so i got into the program and it's a good one and for years i've been saying this was what i wanted to do original research contributing something real but then i did the math on the stipend and it's like thirty thousand a year and i already have a hundred twenty thousand in undergrad loans and two of my friends who got PhDs say they regret it now because the job market is brutal and meanwhile i've had three job offers from industry in the last year all paying way more and i can still do interesting work there but i'm afraid that if i don't do the PhD now i never will and then i'll wonder what if for the rest of my life",
  },
  {
    id: 'f11',
    name: 'Startup pivot or hold course',
    transcript:
      "we've been working on this for eighteen months and the original thesis was about helping small businesses with their accounting and we do have users and they like the product but they're not paying enough to be sustainable and my co-founder thinks we should pivot to enterprise and i can see the logic on paper but we don't have any enterprise relationships and our product isn't built for that sales cycle and i'm worried we'd basically be starting from scratch and we only have about nine months of runway left and i keep going back and forth every week i'm convinced of something different and i don't know how we make this call together",
  },
  {
    id: 'f12',
    name: 'Company transfer to Austin',
    transcript:
      "my company offered me a transfer to Austin and part of me is genuinely excited about it i've been in New York for twelve years and i love it but i'm also kind of ready for something different the cost of living would be so much better and i could actually afford to buy a place and my girlfriend is fully remote so she could come with me but she's built her whole life here her family is here and i don't want to ask her to give all that up and also honestly i'm not sure Austin is where i actually want to go or if it's just that i'm restless and i'd feel the same way in two years no matter where i am",
  },
];
