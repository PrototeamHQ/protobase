/**
 * Resources, fields, views and access rules: what a Protobase config declares, and the models the server, the client and
 * the admin app read from it. A config builds them with {@link resource} and {@link f} ([Data config](website/src/content/docs/reference/data-config.mdx)),
 * {@link view} and {@link l} ([UI config](website/src/content/docs/reference/ui-config.mdx)), and {@link defineRoles} and {@link rule}
 * ([Access](website/src/content/docs/reference/access.mdx)). It runs anywhere, the browser included, and imports no other
 * `@protobase` package.
 *
 * @packageDocumentation
 */
export type {
  FieldType,
  FieldModel,
  FileFieldModel,
  ResourceModel,
  EventModel,
  EventOperation,
  SearchMatch,
  SortSpec,
  KeyValue,
  AppAddress,
  FilterLayout,
  MapView,
  CalendarView,
  TimelineView,
  ListQuery,
  FieldFormat,
  FieldViewModel,
  FieldWidgetModel,
  BadgeShape,
  ListModel,
  ListDragModel,
  PositionAfterModel,
  ParentAccess,
  ParentModel,
  RelatedColumnModel,
  ListDisplayModel,
  CardPhotosModel,
  CardFavoriteModel,
  SaveSearchModel,
  ExportModel,
  CreateModel,
  SearchesOfModel,
  SignInPromptModel,
  SignInViewModel,
  JsonValue,
  DatePreset,
  FilterWidgetModel,
  LayoutItemModel,
  SectionPresentation,
  RelatedPresentation,
  RelatedModel,
  SectionModel,
  GroupModel,
  TabModel,
  TabItemModel,
  GroupItemModel,
  CustomSectionModel,
  MapSectionModel,
  RecordChartModel,
  RecordChartRange,
  GalleryModel,
  HistorySectionModel,
  CommentsSectionModel,
  ChartRange,
  ChartGranularity,
  ChartModel,
  GroupChartModel,
  PeriodChartModel,
  FormModel,
  SaveFeedback,
  RecordMode,
  HelpWhen,
  ShowWhen,
  RecordWhen,
  ActionModel,
  ActionRun,
  ActionInputKind,
  ActionInputModel,
  ViewModel,
  SearchResultModel,
  NamedListModel,
  NavModel,
  NavRecentModel,
  StatusTone,
  UserMenuItemModel,
  UserMenuModel,
  BottomBarItemModel,
  BottomBarModel,
  Span,
  FieldPath,
  DurationUnit,
  DurationLiteral,
  Literal,
  NowValue,
  FilterValue,
  CompareOp,
  FilterOf,
  FilterExpr,
  CheckedFilter,
  FilterErrorCode,
  FilterError,
  OrderByItem,
} from './model'
export { f } from './fields'
export { argumentsSchema, type ArgumentSpec, type ArgumentsSpec, type ArgumentType } from './job-arguments'
export type { Rollup, RollupCount, RollupFn, RollupSource, RollupValue } from './computed/rollup'
export type { ComputedReveal, RevealCaller } from './computed/computed-reveal'
export { resource, type ResourceBuilder, type SearchRef, type SearchRefs, type TenantOptions, type Validator } from './resource'
export type { EventActor, EventContext, EventMatch, EventSpec, EventHelpers, CreatedOptions, UpdatedOptions, DeletedOptions, UndeletedOptions } from './events/event-helpers'
export { isRecordCondition } from './record-when'
export { view, type ViewBuilder, type FieldViews } from './view'
export type { FieldView } from './view-field'
export type { ComponentRef, ViewProps } from './view-displays'
export type { ListColumn } from './view-columns'
export type { ChartInput, GroupChartInput, PeriodChartInput } from './view-chart'
export type { FormInput } from './view-form'
export { fieldRef, type FieldRefValue } from './field-ref'
export { enumLabel } from './enum-label'
export { userMenu, type UserMenuSource } from './user-menu'
export { bottomBar, maxBottomBarItems, type BottomBarSource } from './bottom-bar'
export { bottomBarErrors, type BottomBarNames } from './bottom-bar-errors'
export { layout as l } from './layout'
export { fitsKeyType, keyTypes } from './keys'
export { addressWords, appPath, readAppPath } from './app-address'
export { formPath, formRoute, readFormAddress, type FormAddress } from './form-address'
export { connectParams, connectPath, connectRoute, readConnectAddress, type ConnectAddress } from './connect-address'
export { readSignInAddress, signInParams, signInPath, signInRoute, signInSteps, type SignInAddress, type SignInStep } from './sign-in-address'
export type { KeyType } from './keys'
export type { InferRecord, RecordKey, RecordOf, KeyOf, KeyRefs, Access, Issue } from './resource-types'
export type { Ref, Refs, FieldRefs, FieldsInput } from './refs'
export type { Field, AnyField, FieldMeta, FieldTypeDef, Constraint } from './field'
export { encrypted, type Encrypted } from './encrypted-value'
export type { RelationField } from './relation-field'
export type { FileField } from './file-field'
export { imageFormats, type FileProcessor, type FileProcessorInput, type ImageFormat, type ImageVariant, type ImageVariantOptions, type FileOptions } from './files/file-options'
export {
  parseFilter,
  checkFilter,
  printFilter,
  parseOrderBy,
  printOrderBy,
  checkOrderBy,
  where,
  createWhere,
  evaluateFilter,
} from './filter'
export type { EvaluateOptions, FilterLimits, FilterParse, CheckResult, OrderByParse, OrderByCheck } from './filter'
export {
  defineRoles,
  anonymousRole,
  rule,
  pickView,
  resolveAccess,
  checkRecord,
  fieldsUsedBy,
  accessWarnings,
  restrictModel,
} from './access'
export type {
  Roles,
  RolesOptions,
  RoleEntry,
  RoleLimit,
  HeldCapability,
  CapabilityLimit,
  Rule,
  Capability,
  CapabilityAction,
  CapabilityScope,
  ExactCapability,
  Grant,
  AccessSource,
  ResolveOptions,
  ResolvedAccess,
  RowFilterOperation,
  AccessAction,
  AccessContext,
  AccessFn,
  AccessResult,
  AccessUser,
  FieldAccess,
  FieldRule,
} from './access'
export type {
  AssistantTone,
  AssistantAction,
  AssistantStepState,
  AssistantStep,
  AssistantDiff,
  AssistantTextPart,
  AssistantTablePart,
  AssistantCardPart,
  AssistantWidgetPart,
  AssistantPart,
  AssistantMessage,
  AssistantState,
  AssistantEvent,
  AssistantMessageRequest,
  AssistantActionRequest,
} from './assistant/protocol'
