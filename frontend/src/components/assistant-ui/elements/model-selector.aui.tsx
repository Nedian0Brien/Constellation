"use client";

import { memo, useEffect } from "react";
import { useAui } from "@assistant-ui/react";
import {
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorValue,
  ModelSelectorContent,
  ModelSelectorSearch,
  ModelSelectorFocusAnchor,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorSeparator,
  ModelSelectorItem,
  ModelSelectorEffort,
  ModelSelectorSpeed,
  useModelSelectorContext,
  type ModelSelectorProps,
} from "./model-selector";

// NOTE(agent-chat-framework): speed(service tier) 선택을 re-export 한다.
// speed 는 ModelContext 에 싣지 않는다 — 런타임 `body()` 가 맡는다.
export {
  DEFAULT_EFFORT_OPTIONS,
  DEFAULT_SPEED_OPTION,
  modelSelectorTriggerVariants,
  resolveModelEffort,
  resolveModelSpeed,
  useModelSelectorEfforts,
  useModelSelectorSpeeds,
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorValue,
  ModelSelectorContent,
  ModelSelectorSearch,
  ModelSelectorFocusAnchor,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorSeparator,
  ModelSelectorItem,
  ModelSelectorEffort,
  ModelSelectorSpeed,
} from "./model-selector";

export type {
  ModelOption,
  ModelSelectorEffortOption,
  ModelSelectorSpeedOption,
  ModelSelectorProps,
  ModelSelectorRootProps,
  ModelSelectorTriggerProps,
  ModelSelectorValueProps,
  ModelSelectorContentProps,
  ModelSelectorSearchProps,
  ModelSelectorListProps,
  ModelSelectorEmptyProps,
  ModelSelectorGroupProps,
  ModelSelectorSeparatorProps,
  ModelSelectorItemProps,
  ModelSelectorEffortProps,
  ModelSelectorSpeedProps,
} from "./model-selector";

/** Registers the selection with assistant-ui's ModelContext system. The
 * context's effort is already resolved against the selected model.
 * NOTE(agent-chat-framework): 내보낸다 — Root 를 직접 조립해 그룹·로고를 넣을
 * 때도 같은 등록이 필요하다. */
export function ModelSelectorModelContext() {
  const { value, effort } = useModelSelectorContext();
  const api = useAui();

  useEffect(() => {
    if (value === undefined) return;
    const config = {
      config: {
        modelName: value,
        ...(effort !== undefined ? { reasoningEffort: effort } : undefined),
      },
    };
    return api.modelContext.register({
      getModelContext: () => config,
    });
  }, [api, value, effort]);

  return null;
}

const ModelSelectorImpl = ({
  searchable,
  variant,
  size,
  align,
  className,
  contentClassName,
  ...rootProps
}: ModelSelectorProps) => {
  return (
    <ModelSelectorRoot {...rootProps}>
      <ModelSelectorModelContext />
      <ModelSelectorTrigger
        variant={variant}
        size={size}
        className={className}
      />
      <ModelSelectorContent
        {...(align !== undefined ? { align } : {})}
        className={contentClassName}
        searchable={searchable ?? false}
      />
    </ModelSelectorRoot>
  );
};

type ModelSelectorComponent = typeof ModelSelectorImpl & {
  displayName?: string;
  Root: typeof ModelSelectorRoot;
  Trigger: typeof ModelSelectorTrigger;
  Value: typeof ModelSelectorValue;
  Content: typeof ModelSelectorContent;
  Search: typeof ModelSelectorSearch;
  FocusAnchor: typeof ModelSelectorFocusAnchor;
  List: typeof ModelSelectorList;
  Empty: typeof ModelSelectorEmpty;
  Group: typeof ModelSelectorGroup;
  Separator: typeof ModelSelectorSeparator;
  Item: typeof ModelSelectorItem;
  Effort: typeof ModelSelectorEffort;
  Speed: typeof ModelSelectorSpeed;
  ModelContext: typeof ModelSelectorModelContext;
};

const ModelSelector = memo(
  ModelSelectorImpl,
) as unknown as ModelSelectorComponent;

ModelSelector.displayName = "ModelSelector";
ModelSelector.Root = ModelSelectorRoot;
ModelSelector.Trigger = ModelSelectorTrigger;
ModelSelector.Value = ModelSelectorValue;
ModelSelector.Content = ModelSelectorContent;
ModelSelector.Search = ModelSelectorSearch;
ModelSelector.FocusAnchor = ModelSelectorFocusAnchor;
ModelSelector.List = ModelSelectorList;
ModelSelector.Empty = ModelSelectorEmpty;
ModelSelector.Group = ModelSelectorGroup;
ModelSelector.Separator = ModelSelectorSeparator;
ModelSelector.Item = ModelSelectorItem;
ModelSelector.Effort = ModelSelectorEffort;
ModelSelector.Speed = ModelSelectorSpeed;
ModelSelector.ModelContext = ModelSelectorModelContext;

export { ModelSelector };
