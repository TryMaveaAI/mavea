// plainWords.ts — ordinary English words, the ones a synthesizer already says correctly.
//
// The model is asked to mark terms a voice would mangle as [[shown|said]] and to invent a lowercase
// respelling for the said side. It over-reaches: told to catch anything "a synthesizer could
// plausibly mispronounce", it also respells ordinary vocabulary — and because the respelling is
// invented rather than looked up, a false positive does not merely waste a tag, it makes the voice
// say a common word WRONG. Nothing downstream could tell a good annotation from a bad one.
//
// This is the evidence for the one case shape alone cannot decide: a plain lowercase word. Anything
// carrying a digit, a symbol, a capital or a non-ASCII letter is self-evidently a term and passes
// untouched (see annotationGuard). What is left is "gnocchi" versus "analysis" — and a common-word
// list separates them by construction, because a borrowed or technical term is never in one.
//
// Deliberately skewed toward what actually gets over-annotated: multi-syllable Latinate vocabulary
// and irregularly-spelled English ("colonel", "salmon", "queue", "receipt"). The very short, very
// common words are never annotated by anyone, so they earn no space here.
//
// Errors of omission are harmless (the annotation simply survives, as it does today). Errors of
// commission would cost a real annotation — so ONLY ordinary English belongs here, never a loanword
// a voice genuinely needs help with.
//
// Stored as one space-separated string: the most compact source form and the cheapest to parse.
// Reached only through annotationGuard, which the Live/turn chunks own — never the landing.

const WORDS =
  'about above accept access accident accommodate accompany accomplish according account accurate' +
  ' achieve acknowledge acquire across action active activity actual actually adapt address' +
  ' adequate adjust administration admit adopt adult advance advantage adventure advertise advice' +
  ' advise affair affect afford afraid after afternoon again against agency agenda agent' +
  ' aggressive ago agree agreement agriculture ahead album alcohol alive allow almost alone along' +
  ' already although altogether always amazing ambition among amount analysis analyze ancient' +
  ' anger angle angry animal anniversary announce annual another answer anticipate anxiety anxious' +
  ' anybody anyone anything anyway anywhere apart apartment apologize apparent apparently appeal' +
  ' appear appearance apple application apply appoint appreciate approach appropriate approval' +
  ' approve approximate architecture argue argument arise around arrange arrangement arrival' +
  ' arrive article artificial aside aspect assemble assess asset assign assist associate assume' +
  ' assumption assure athlete atmosphere attach attack attempt attend attention attitude attorney' +
  ' attract attractive audience author authority automatic autumn available average avoid award' +
  ' aware awareness away awful awkward baby background backward balance ballot banana bandwidth' +
  ' barely bargain barrier baseball basic basically basis basket bathroom battery battle beach' +
  ' bear beautiful beauty because become bedroom before begin beginning behalf behavior behind' +
  ' belief believe belong below beneath benefit beside besides better between beyond bicycle' +
  ' billion biology birthday bitter blanket bleed blind block blood board boat body boil bone' +
  ' bonus border boring borrow bother bottle bottom boundary bracket brain branch brave bread' +
  ' break breakfast breath breathe brick bridge brief bright brilliant bring broad broken brother' +
  ' brown brush budget build building bulletin bunch burden bureau burn business busy butter' +
  ' button buyer cabin cabinet cable calculate calendar camera campaign campus cancel cancer' +
  ' candidate capable capacity capital captain capture carbon career careful carefully carrot' +
  ' carry cartoon category cattle caught cause caution ceiling celebrate celebration cell cemetery' +
  ' census center central century ceremony certain certainly certificate chain chair challenge' +
  ' chamber champion chance change channel chapter character characteristic charge charity chart' +
  ' chase cheap check cheese chemical chemistry chest chicken chief child childhood chocolate' +
  ' choice choose chronic church circle circuit circumstance citizen civil civilian claim clarify' +
  ' class classic classroom clean clear clearly client climate climb clinic clock close closely' +
  ' closet clothes cloud coach coast coffee cognitive coincidence collapse colleague collect' +
  ' collection college colonel colony color column combination combine come comfort comfortable' +
  ' command comment commercial commission commit committee common communicate communication' +
  ' community company compare comparison compete competition complain complaint complete' +
  ' completely complex complicated component compose composition compound comprehensive compromise' +
  ' computer conceive concentrate concept concern concert conclude conclusion concrete condition' +
  ' conduct conference confidence confident confirm conflict confuse confusion congress connect' +
  ' connection conscience conscious consecutive consensus consequence conservative consider' +
  ' considerable consideration consist consistent constant constitute constitution constraint' +
  ' construct construction consult consume consumer contact contain container contemporary content' +
  ' contest context continue continuous contract contrast contribute contribution control' +
  ' controversial convenience convenient conventional conversation convert convince cook cool' +
  ' cooperate coordinate copy corner corporate correct correspond cost cottage cotton could' +
  ' council counsel count counter country county couple courage course court cousin cover coverage' +
  ' cream create creation creative creature credit crew crime criminal crisis criteria critical' +
  ' criticism criticize crop cross crowd crucial cruel crystal cultural culture curious currency' +
  ' current currently curriculum curtain custom customer cycle damage dance danger dangerous data' +
  ' database daughter dawn deadline deal debate debt decade decide decision declare decline' +
  ' decrease dedicate deep deeply defeat defend defense deficit define definitely definition' +
  ' degree delay deliberate delicate delicious deliver delivery demand democracy demonstrate' +
  ' density department depend dependent depict deposit depression depth deputy derive describe' +
  ' description desert deserve design designer desire desk desperate despite destroy destruction' +
  ' detail detailed detect determine develop development device devote diagnose diagram dialogue' +
  ' diameter diamond diet differ difference different differently difficult difficulty digital' +
  ' dimension dinner direct direction directly director dirty disability disagree disappear' +
  ' disaster discipline disclose discount discourse discover discovery discuss discussion disease' +
  ' dish dismiss disorder display dispute distance distant distinct distinction distinguish' +
  ' distribute distribution district diverse diversity divide division divorce doctor document' +
  ' documentary dollar domain domestic dominant dominate donate door double doubt downtown dozen' +
  ' draft drag drama dramatic draw drawing dream dress drink drive driver drop drug during dust' +
  ' duty eager early earn earnings earth easily eastern easy economic economics economy edge' +
  ' edition editor educate education educational effect effective effectively efficiency efficient' +
  ' effort eight either elaborate elderly elect election electric electricity electronic element' +
  ' elementary elevator eligible eliminate elite elsewhere embrace emerge emergency emission' +
  ' emotion emotional emphasis emphasize empire employ employee employer employment empty enable' +
  ' encounter encourage endless endure enemy energy enforce engage engine engineer engineering' +
  ' enhance enjoy enormous enough ensure enter enterprise entertainment enthusiasm entire entirely' +
  ' entitle entrance entry envelope environment environmental episode equal equation equipment' +
  ' equivalent error escape especially essay essential essentially establish establishment estate' +
  ' estimate ethics ethnic evaluate evaluation even evening event eventually ever every everybody' +
  ' everyone everything everywhere evidence evident evolution evolve exact exactly examine example' +
  ' exceed excellent except exception excess exchange excited excitement exciting exclude' +
  ' exclusive excuse execute executive exercise exhibit exhibition exist existence existing expand' +
  ' expansion expect expectation expense expensive experience experiment expert explain' +
  ' explanation explode exploit explore explosion export expose exposure express expression extend' +
  ' extension extensive extent external extra extraordinary extreme extremely fabric face facility' +
  ' fact factor factory faculty fail failure fair fairly faith fall false familiar family famous' +
  ' fantasy farm farmer fashion fast faster father fault favor favorite feature federal feedback' +
  ' feeling fellow female fence festival fever field fifteen fifty fight figure file fill film' +
  ' filter final finally finance financial find finding fine finger finish fire firm first fiscal' +
  ' fisherman fitness five fixed flag flame flat flavor flee flexible flight float floor flour' +
  ' flow flower fluid focus follow following food foot football force forecast foreign forest' +
  ' forever forget forgive form formal format formation former formula fortune forward foundation' +
  ' founder four fourth fraction fragile frame framework free freedom freeze frequency frequent' +
  ' frequently fresh friend friendly friendship front frozen fruit frustrate fuel full fully' +
  ' function fund fundamental funding funeral funny furniture further furthermore future gain' +
  ' gallery game gang gap garage garden garlic gasoline gather gear gender general generally' +
  ' generate generation generous genetic gentle gentleman genuine gesture giant gift girl give' +
  ' glad glance glass global glove goal golden golf good govern government governor grab grade' +
  ' gradually graduate grain grand grandfather grandmother grant graph graphic grass grateful' +
  ' grave gravity great greatest green greet grocery ground group grow growth guarantee guard' +
  ' guess guest guidance guide guideline guilty guitar habit habitat hair half hall hand handful' +
  ' handle hang happen happy harbor hard hardly harm harmony harvest hate head headline health' +
  ' healthy hear hearing heart heat heaven heavily heavy height helicopter hello help helpful' +
  ' hence herself hesitate hidden hide hierarchy high highlight highly highway hire historian' +
  ' historic historical history hold hole holiday hollow holy home homeless honest honey honor' +
  ' hope horizon horror horse hospital host hotel hour house household housing however huge human' +
  ' humor hundred hungry hunt hurry hurt husband hypothesis ice idea ideal identical identify' +
  ' identity ideology ignore illegal illness illustrate image imagination imagine immediate' +
  ' immediately immigrant immigration impact implement implication imply importance important' +
  ' impose impossible impress impression impressive improve improvement incentive incident include' +
  ' including income increase increasingly incredible indeed independence independent index' +
  ' indicate indication indicator individual industrial industry inevitable infant infection' +
  ' inflation influence inform information infrastructure ingredient initial initially initiative' +
  ' injury inner innocent innovation input inquiry inside insight insist inspire install instance' +
  ' instead institute institution instruction instructor instrument insurance intact integrate' +
  ' integrity intellectual intelligence intend intense intensity intention interact interaction' +
  ' interest interested interesting interface interior internal international internet interpret' +
  ' interpretation interrupt interval intervention interview introduce introduction invest' +
  ' investigate investigation investment investor invisible invitation invite involve involvement' +
  ' iron island issue item itself jacket jail january jealous jewelry job join joint joke journal' +
  ' journalist journey judge judgment juice jump junior jury justice justify keen keep kettle key' +
  ' keyboard kick kid kill kilometer kind king kitchen knee knife knock knowledge known label' +
  ' labor laboratory ladder lady lake land landscape language large largely last late later latter' +
  ' laugh launch laundry law lawn lawsuit lawyer layer layout lead leader leadership leading leaf' +
  ' league lean learn learning least leather leave lecture left legacy legal legend legislation' +
  ' legitimate leisure lemon lend length less lesson letter level liberal library license lie life' +
  ' lifestyle lifetime lift light like likely limit limited line link lion liquid list listen' +
  ' literacy literally literature little live living load loan lobby local locate location lock' +
  ' logic lonely long look loose lose loss lost loud love lovely lower loyalty luck lucky lunch' +
  ' luxury machine magazine magic magnetic mail main mainly maintain maintenance major majority' +
  ' make maker male mall manage management manager mandate manner manual manufacture manufacturer' +
  ' many map marble march margin marine mark market marketing marriage married marry mask mass' +
  ' massive master match material math mathematics matter mature maximum maybe mayor meal mean' +
  ' meaning meanwhile measure meat mechanical mechanism media medical medication medicine medium' +
  ' meet meeting melody member membership memory mental mention menu merchant mere merely merge' +
  ' message metal method middle midnight might migration mile military milk million mind mineral' +
  ' minimal minimum minister minor minority minute miracle mirror miss missile mission mistake mix' +
  ' mixture mobile mode model moderate modern modest modify moment money monitor month mood moon' +
  ' moral more moreover morning mortgage mostly mother motion motivation motor mount mountain' +
  ' mouse mouth move movement movie much multiple murder muscle museum music musical musician' +
  ' mutual mystery myth naked name narrative narrow nation national native natural naturally' +
  ' nature navy near nearby nearly necessarily necessary neck need negative neglect negotiate' +
  ' neighbor neighborhood neither nerve nervous network neutral never nevertheless newly newspaper' +
  ' next nice night nine nobody noise nominate none nonetheless noon normal normally north' +
  ' northern nose note nothing notice notion novel november nowhere nuclear number numerous nurse' +
  ' nutrition obesity object objective obligation observation observe obtain obvious obviously' +
  ' occasion occasionally occupation occupy occur ocean october offer office officer official' +
  ' often oil okay older once ongoing onion online only onto open opening operate operation' +
  ' operator opinion opponent opportunity oppose opposite opposition option orange order ordinary' +
  ' organic organization organize origin original originally other otherwise ought ourselves' +
  ' outcome outdoor outline output outside overall overcome overlook overseas owner ownership' +
  ' oxygen pace pack package page pain painful paint painter painting pair palace pale panel panic' +
  ' paper parade parent park parking part participant participate particular particularly partner' +
  ' partnership party pass passage passenger passion past patch path patient pattern pause payment' +
  ' peace peak peer penalty pencil pension people pepper per percent percentage perception perfect' +
  ' perfectly perform performance perhaps period permanent permission permit person personal' +
  ' personality personally personnel perspective persuade phase phenomenon philosophy phone photo' +
  ' photograph photographer phrase physical physician physics piano pick picture piece pile pilot' +
  ' pine pink pipe pitch place plain plan plane planet planning plant plastic plate platform play' +
  ' player please pleasure plenty plot plus pocket poem poet poetry point police policy political' +
  ' politician politics poll pollution pool poor popular population port portion portrait pose' +
  ' position positive possess possibility possible possibly post potato potential potentially' +
  ' pound pour poverty powder power powerful practical practice praise pray prayer precise' +
  ' precisely predict prediction prefer preference pregnancy pregnant preparation prepare' +
  ' prescription presence present presentation preserve president press pressure pretend pretty' +
  ' prevent previous previously price pride primarily primary prime principal principle print' +
  ' prior priority prison prisoner privacy private privilege prize probably problem procedure' +
  ' proceed process produce producer product production professional professor profile profit' +
  ' program progress project prominent promise promote prompt proof proper properly property' +
  ' proportion proposal propose prospect protect protection protein protest proud prove provide' +
  ' province provision psychological psychology public publication publicly publish publisher pull' +
  ' punch punishment purchase pure purpose pursue push qualify quality quantity quarter queen' +
  ' question queue quick quickly quiet quietly quit quite quote race racial radical radio railroad' +
  ' rain raise range rank rapid rapidly rare rarely rate rather rating ratio rational reach react' +
  ' reaction read reader reading ready real reality realize really reason reasonable recall' +
  ' receipt receive recent recently reception recipe recognition recognize recommend' +
  ' recommendation record recover recovery recruit reduce reduction refer reference reflect' +
  ' reflection reform refuse regard regime region regional register regular regularly regulate' +
  ' regulation reinforce reject relate relation relationship relative relatively relax release' +
  ' relevant reliable relief religion religious rely remain remaining remark remarkable remember' +
  ' remind remote remove render rent repair repeat replace reply report reporter represent' +
  ' representative reputation request require requirement rescue research researcher resemble' +
  ' reservation resident resist resistance resolution resolve resort resource respect respond' +
  ' response responsibility responsible rest restaurant restore restrict result retail retain' +
  ' retire retirement return reveal revenue reverse review revolution reward rhythm rice rich ride' +
  ' ridiculous rifle right ring rise risk river road robot rock role roll roof room root rope' +
  ' rough roughly round route routine royal rubber rule ruling rumor rural rush sacred sacrifice' +
  ' safe safety salad salary sale salmon salt sample sanction sand satellite satisfaction satisfy' +
  ' sauce save saving scale scan scandal scenario scene schedule scheme scholar scholarship school' +
  ' science scientific scientist scope score scratch screen script sculpture search season seat' +
  ' second secondary secret secretary section sector secure security seed seek seem segment seize' +
  ' seldom select selection sell senate senator send senior sense sensitive sentence separate' +
  ' sequence series serious seriously servant serve service session settle settlement seven' +
  ' several severe sexual shade shadow shake shall shallow shame shape share sharp shed sheet' +
  ' shelf shell shelter shift shine ship shirt shock shoe shoot shop shopping shore short shortage' +
  ' shortly shot should shoulder shout show shower shrimp shut sick side sight sign signal' +
  ' significant significantly silence silent silver similar similarly simple simply since sing' +
  ' singer single sister site situation size skill skin sky sleep slice slide slight slightly slip' +
  ' slow slowly small smart smell smile smoke smooth snap snow social society soft software soil' +
  ' solar soldier sole solid solution solve some somebody somehow someone something sometimes' +
  ' somewhat somewhere song soon sophisticated sorry sort soul sound soup source south southern' +
  ' space spare speak speaker special specialist species specific specifically specify spectrum' +
  ' speech speed spend spending spirit spiritual split spokesman sponsor sport spot spread spring' +
  ' square squeeze stability stable staff stage stair stake stand standard standing star stare' +
  ' start state statement station statistics status stay steady steal steam steel step stick still' +
  ' stimulus stock stomach stone stop storage store storm story straight strain strange strategic' +
  ' strategy stream street strength strengthen stress stretch strict strike string strip stroke' +
  ' strong strongly structure struggle student studio study stuff stupid style subject submit' +
  ' subsequent substance substantial substitute succeed success successful successfully such' +
  ' sudden suddenly suffer sufficient sugar suggest suggestion suit suitable summary summer summit' +
  ' sunlight super supply support supporter suppose supreme sure surely surface surgery surprise' +
  ' surprising surround survey survival survive survivor suspect suspend sustain swear sweep sweet' +
  ' swim swing switch symbol sympathy symptom syndrome system table tablet tackle tail take tale' +
  ' talent talk tall tank tape target task taste tax taxpayer teach teacher teaching team tear' +
  ' technical technique technology teenager telephone telescope television tell temperature' +
  ' temporary tend tendency tension term terrible territory terror test testify testimony testing' +
  ' text texture thank theater theme themselves theory therapy there therefore thick thin thing' +
  ' think thinking third thirty thorough though thought thousand threat threaten three threshold' +
  ' throat through throughout throw thus ticket tide tight time tiny tired tissue title tobacco' +
  ' today together tomato tomorrow tone tongue tonight tool tooth top topic total totally touch' +
  ' tough tour tourism tourist tournament toward tower town toxic toy trace track trade tradition' +
  ' traditional traffic tragedy trail train training transaction transfer transform transformation' +
  ' transit transition translate transmission transport travel treat treatment treaty tree' +
  ' tremendous trend trial tribe trick trigger trip troop trouble truck true truly trust truth' +
  ' tube tune tunnel turn twelve twenty twice twin type typical typically ugly ultimate ultimately' +
  ' unable uncertainty uncle uncomfortable unconscious undergo underlying understand understanding' +
  ' undertake unemployment unexpected unfair unfortunately uniform union unique unit universal' +
  ' universe university unknown unless unlike unlikely until unusual upon upper upset urban urge' +
  ' urgent usage useful user usual usually utility vacation valid valley valuable value variable' +
  ' variation variety various vary vast vegetable vehicle venture venue verbal verdict verify' +
  ' version versus vertical very vessel veteran victim victory video view viewer village violate' +
  ' violence violent virtual virtually virus visible vision visit visitor visual vital voice' +
  ' volume voluntary volunteer vote voter voting vulnerable wage wait wake walk wall wander want' +
  ' warm warn warning wash waste watch water wave weak wealth weapon wear weather wedding week' +
  ' weekend weekly weigh weight welcome welfare well western whatever wheat wheel whenever whereas' +
  ' wherever whether while whisper white whole whom whose wide widely widespread wife wild will' +
  ' willing win wind window wine wing winner winter wipe wire wisdom wise wish withdraw within' +
  ' without witness woman wonder wonderful wood wooden word work worker workshop world worried' +
  ' worry worth would wound wrap write writer writing wrong yard year yellow yesterday yield young' +
  ' youth';

const PLAIN_WORDS = new Set(WORDS.split(' '));

/** True when `word` is an ordinary English word — one a voice already says correctly, and so one
 *  that must never be re-spelled on the model's guess. Callers pass a single lowercase token. */
export function isPlainEnglishWord(word: string): boolean {
  return PLAIN_WORDS.has(word);
}
