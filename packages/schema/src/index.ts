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
  ListQuery,
  FieldFormat,
  FieldViewModel,
  FieldWidgetModel,
  BadgeShape,
  ListModel,
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
  RelatedModel,
  CustomSectionModel,
  MapSectionModel,
  GalleryModel,
  ChartRange,
  ChartGranularity,
  ChartModel,
  SaveFeedback,
  RecordMode,
  HelpWhen,
  ShowWhen,
  ActionModel,
  ActionRun,
  ActionInputKind,
  ActionInputModel,
  ViewModel,
  SearchResultModel,
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
export { resource, type ResourceBuilder, type SearchRef, type SearchRefs, type Validator } from './resource'
export type { EventActor, EventContext, EventMatch, EventSpec, EventHelpers, CreatedOptions, UpdatedOptions, DeletedOptions, UndeletedOptions } from './events/event-helpers'
export { view, type ViewBuilder, type FieldViews } from './view'
export type { FieldView } from './view-field'
export type { ComponentRef, ViewProps } from './view-displays'
export type { ListColumn } from './view-columns'
export { fieldRef, type FieldRefValue } from './field-ref'
export { enumLabel } from './enum-label'
export { userMenu, type UserMenuSource } from './user-menu'
export { bottomBar, maxBottomBarItems, type BottomBarSource } from './bottom-bar'
export { bottomBarErrors, type BottomBarNames } from './bottom-bar-errors'
export { layout as l } from './layout'
export { fitsKeyType, keyTypes } from './keys'
export { addressWords, appPath, readAppPath } from './app-address'
export { readSignInAddress, signInParams, signInPath, signInRoute, signInSteps, type SignInAddress, type SignInStep } from './sign-in-address'
export type { KeyType } from './keys'
export type { InferRecord, RecordKey, RecordOf, KeyOf, KeyRefs, Access, Issue } from './resource-types'
export type { Ref, Refs, FieldRefs, FieldsInput } from './refs'
export type { Field, AnyField, FieldMeta, FieldTypeDef, Constraint } from './field'
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
