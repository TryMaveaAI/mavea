import { entry, type BlockRegistry } from '../registry-types';
import { Reasoning } from './Reasoning';
import { ToolCalls } from './ToolCalls';
import { AgentTrace } from './AgentTrace';
import { ModelCompare } from './ModelCompare';
import { TokenStream } from './TokenStream';
import { Retrieval } from './Retrieval';
import { WhatChanged } from './WhatChanged';
import { Routing } from './Routing';
import { EmbedMap } from './EmbedMap';
import { Calibration } from './Calibration';
import { HttpExchange } from './HttpExchange';
import { TrainingCurve } from './TrainingCurve';
// The family's own styles ride its chunk — cssCodeSplit inserts them before evaluation.
import './styles.css';

/** ai family registry — entries: key: entry(Comp) — an explicit arrow only when a block needs spotlight/dim */
export const aiRegistry: BlockRegistry = {
  reasoning: entry(Reasoning),
  toolcalls: entry(ToolCalls),
  agenttrace: entry(AgentTrace),
  modelcompare: entry(ModelCompare),
  tokenstream: entry(TokenStream),
  retrieval: entry(Retrieval),
  whatchanged: entry(WhatChanged),
  routing: entry(Routing),
  embedmap: entry(EmbedMap),
  calibration: entry(Calibration),
  httpexchange: entry(HttpExchange),
  trainingcurve: entry(TrainingCurve),
};
