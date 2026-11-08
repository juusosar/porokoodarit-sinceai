/* Generated from app/shared/fit_state.schema.json by npm run gen:types. Do not edit. */

export type Age = number | null;
export type Carry7IYd = number | null;
/**
 * @maxItems 3
 */
export type Characteristics =
  | []
  | ["forgiveness" | "distance" | "forged feel" | "distance control" | "workability" | "less offset" | "more offset"]
  | [
      "forgiveness" | "distance" | "forged feel" | "distance control" | "workability" | "less offset" | "more offset",
      "forgiveness" | "distance" | "forged feel" | "distance control" | "workability" | "less offset" | "more offset"
    ]
  | [
      "forgiveness" | "distance" | "forged feel" | "distance control" | "workability" | "less offset" | "more offset",
      "forgiveness" | "distance" | "forged feel" | "distance control" | "workability" | "less offset" | "more offset",
      "forgiveness" | "distance" | "forged feel" | "distance control" | "workability" | "less offset" | "more offset"
    ];
export type Flight = ("low" | "mid" | "high") | null;
export type Glove = ("XS" | "S" | "M" | "M/L" | "L" | "XL") | null;
export type Hand = ("right" | "left") | null;
export type HeightCm = number | null;
export type Own7ILoftDeg = number | null;
export type ScoreBucket = number | null;
export type Sex = ("male" | "female") | null;
export type Speed7IMph = number | null;
export type Tempo = ("smooth" | "moderate" | "quick") | null;
export type WristToFloorCm = number | null;
export type After = string | null;
export type Before = string | null;
export type ConfidenceAfter = number;
export type ConfidenceBefore = number | null;
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "SpecPart".
 */
export type SpecPart = "head" | "shaft" | "length" | "lie" | "grip" | "hand" | "purchase";
/**
 * Value on the other side of the line
 */
export type Alternative = string;
/**
 * Distance to the decision line, in the input's unit
 */
export type Margin = number;
export type NoteCode = string | null;
export type Unit = string;
/**
 * Input key, e.g. 'speed_7i_mph', 'flight', 'tempo'
 */
export type Input = string;
/**
 * Display text, e.g. 'Launch monitor speed'
 */
export type Label = string;
export type Method = string | null;
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "EvidenceSource".
 */
export type EvidenceSource = "asked" | "measured" | "estimated" | "default";
/**
 * Display value with unit, e.g. '82 mph'
 */
export type Value = string;
/**
 * Share of the estimate (inverse-variance weight); 1 = decided it
 */
export type Weight = number;
/**
 * e.g. 'questionnaire', 'photo', 'video_240fps'
 */
export type Method1 = string | null;
export type Sd = number;
export type Value1 = number;
export type Buildable = boolean;
/**
 * Diff vs previous state
 */
export type Changes = Change[];
export type High = number;
export type Low = number;
export type Head = "101-mkii" | "201-mkii" | "201t-mkii" | "301-cb" | "301-mb";
export type Probability = number;
export type Score = number;
export type HeadOptions = HeadOption[];
/**
 * Reason code for the prompt line
 */
export type Code = string;
/**
 * Expected confidence gain, weighted sum over parts
 */
export type Gain = number;
/**
 * What to add, e.g. 'ball_line_test', 'launch_monitor'
 */
export type Input1 = string;
/**
 * Parts it would firm up
 */
export type Parts = SpecPart[];
/**
 * Best inputs to add next, highest gain first
 */
export type NextSteps = NextStep[];
export type Confidence = number;
export type Evidence = EvidenceSource[];
/**
 * Evidence chain behind the value
 */
export type Inputs = EvidenceItem[];
/**
 * Display text, e.g. '+0.5 in', 'KBS Tour Lite R'
 */
export type Label1 = string;
/**
 * Id from reason_codes.json, e.g. 'LENGTH_FROM_HEIGHT'
 */
export type Code1 = string;
export type Reasons = Reason[];
/**
 * Chosen value; None = not enough evidence yet
 */
export type Value2 = string | number | null;
export type SchemaVersion = "1";
export type Step = string;
/**
 * What the fit needs, e.g. '-2°'
 */
export type CustomValue = string;
/**
 * Reason code describing the trade-off
 */
export type ImpactCode = string;
/**
 * What stock would give, e.g. 'Standard'
 */
export type StockValue = string;
/**
 * Parts that make the fit custom
 */
export type Blockers = StockBlocker[];
/**
 * Custom parts where standard is nearly as likely (stock worth considering)
 */
export type CloseCallParts = SpecPart[];
export type OneTweakFromStock = boolean;
export type Recommended = "stock" | "custom";
export type Warnings = Reason[];
export type SchemaVersion1 = "1";
/**
 * UI step that triggered this run, e.g. 'profile', 'swing'
 */
export type Step1 = string;

export interface TakomoFitStateV1 {
  [k: string]: unknown;
}
/**
 * Questionnaire answers. Every field optional so the engine can run after each step.
 *
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "Answers".
 */
export interface Answers {
  age?: Age;
  carry_7i_yd?: Carry7IYd;
  characteristics?: Characteristics;
  flight?: Flight;
  glove?: Glove;
  hand?: Hand;
  height_cm?: HeightCm;
  own_7i_loft_deg?: Own7ILoftDeg;
  score_bucket?: ScoreBucket;
  sex?: Sex;
  speed_7i_mph?: Speed7IMph;
  tempo?: Tempo;
  wrist_to_floor_cm?: WristToFloorCm;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "Change".
 */
export interface Change {
  after: After;
  before: Before;
  confidence_after: ConfidenceAfter;
  confidence_before?: ConfidenceBefore;
  part: SpecPart;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "CloseCall".
 */
export interface CloseCall {
  alternative: Alternative;
  margin: Margin;
  note_code?: NoteCode;
  unit: Unit;
}
/**
 * One input behind a part, with its share of the fused estimate (the "Why" drawer).
 *
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "EvidenceItem".
 */
export interface EvidenceItem {
  input: Input;
  label: Label;
  method?: Method;
  source: EvidenceSource;
  value: Value;
  weight: Weight;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "FitRequest".
 */
export interface FitRequest {
  answers?: Answers;
  measurements?: Measurements;
  /**
   * Last fit state, used to build the diff
   */
  previous?: FitState | null;
  schema_version?: SchemaVersion1;
  step: Step1;
}
/**
 * Values measured on the device / launch monitor. Keys follow lab phone_measurements.csv.
 *
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "Measurements".
 */
export interface Measurements {
  backswing_s?: Observation | null;
  ball_line_tilt_deg?: Observation | null;
  carry_7i_yd?: Observation | null;
  downswing_s?: Observation | null;
  hand_length_cm?: Observation | null;
  height_cm?: Observation | null;
  landing_deg?: Observation | null;
  launch_deg?: Observation | null;
  lie_need_deg?: Observation | null;
  speed_7i_mph?: Observation | null;
  spin_rpm?: Observation | null;
  video_speed_7i_mph?: Observation | null;
  wrist_to_floor_cm?: Observation | null;
}
/**
 * One value for one input, from one source, with its uncertainty (1 SD, same unit).
 *
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "Observation".
 */
export interface Observation {
  method?: Method1;
  sd: Sd;
  source: EvidenceSource;
  value: Value1;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "FitState".
 */
export interface FitState {
  buildable: Buildable;
  changes?: Changes;
  estimates?: Estimates;
  head_options?: HeadOptions;
  next_steps?: NextSteps;
  parts: Parts1;
  schema_version?: SchemaVersion;
  step: Step;
  stock_advice?: StockAdvice | null;
  warnings?: Warnings;
}
/**
 * Fused input estimates, mean +- 1 SD (e.g. speed_7i_mph)
 */
export interface Estimates {
  [k: string]: Range;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "Range".
 */
export interface Range {
  high: High;
  low: Low;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "HeadOption".
 */
export interface HeadOption {
  head: Head;
  probability: Probability;
  score: Score;
}
/**
 * A missing or weak input, ranked by how much it would raise confidence.
 *
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "NextStep".
 */
export interface NextStep {
  code: Code;
  gain: Gain;
  input: Input1;
  parts?: Parts;
}
export interface Parts1 {
  [k: string]: PartState;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "PartState".
 */
export interface PartState {
  close_call?: CloseCall | null;
  confidence: Confidence;
  evidence?: Evidence;
  inputs?: Inputs;
  label: Label1;
  part: SpecPart;
  /**
   * Plausible numeric range (length/lie)
   */
  range?: Range | null;
  reasons?: Reasons;
  value: Value2;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "Reason".
 */
export interface Reason {
  code: Code1;
  params?: Params;
}
export interface Params {
  [k: string]: string | number;
}
/**
 * Stock vs custom (POR-17). Stock = faster delivery + 30-day returns; custom = no returns.
 *
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "StockAdvice".
 */
export interface StockAdvice {
  blockers?: Blockers;
  close_call_parts?: CloseCallParts;
  one_tweak_from_stock?: OneTweakFromStock;
  recommended: Recommended;
  stock_alternative?: StockAlternative;
}
/**
 * This interface was referenced by `TakomoFitStateV1`'s JSON-Schema
 * via the `definition` "StockBlocker".
 */
export interface StockBlocker {
  custom_value: CustomValue;
  impact_code: ImpactCode;
  params?: Params1;
  part: SpecPart;
  stock_value: StockValue;
}
export interface Params1 {
  [k: string]: string | number;
}
/**
 * Nearest stock build (labels) if the golfer prefers stock
 */
export interface StockAlternative {
  [k: string]: string;
}
