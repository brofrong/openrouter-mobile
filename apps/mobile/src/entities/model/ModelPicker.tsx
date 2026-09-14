import { Ionicons } from "@expo/vector-icons";
import type { ReasoningEffort } from "@openrouter-mobile/domain";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FlatList, type ListRenderItem, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Button,
  H2,
  Input,
  Paragraph,
  ScrollView,
  Spinner,
  Text,
  useTheme,
  XStack,
  YStack,
} from "tamagui";
import { formatRpcError } from "../../shared/errors";
import { ModalProvider } from "../../shared/ui/ModalProvider";
import type { ModelIdentity } from "./identity";
import { ProviderMark } from "./ModelChip";
import { modelRowMeta } from "./model-meta";
import { MODEL_PAGE_SIZE, paginateModels } from "./paginate-models";

export type PickerModel = ModelIdentity & {
  readonly efforts?: ReadonlyArray<ReasoningEffort>;
  readonly defaultEffort?: ReasoningEffort;
  readonly contextLength?: number;
  readonly promptUsdPerMillion?: number;
};

export type ModelPage = {
  readonly models: ReadonlyArray<PickerModel>;
  readonly hasMore: boolean;
};

type PickerShellProps = {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly scroll?: boolean;
};

export function PickerShell({
  open,
  title,
  onClose,
  children,
  scroll = true,
}: PickerShellProps) {
  if (!open) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <ModalProvider>
        <PickerBody onClose={onClose} scroll={scroll} title={title}>
          {children}
        </PickerBody>
      </ModalProvider>
    </Modal>
  );
}

type PickerBodyProps = {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly scroll: boolean;
};

function PickerBody({ title, onClose, children, scroll }: PickerBodyProps) {
  const theme = useTheme();
  const iconColor = theme.color?.val ?? "#111";
  const background = theme.background?.val;

  return (
    <SafeAreaView style={{ backgroundColor: background, flex: 1 }}>
      <YStack bg="$background" flex={1}>
        <XStack gap="$2" items="center" p="$3">
          <Pressable
            accessibilityLabel={`Close ${title}`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onClose}
          >
            <Ionicons color={iconColor} name="close" size={28} />
          </Pressable>
          <H2>{title}</H2>
        </XStack>
        {scroll ? (
          <ScrollView flex={1} px="$3">
            {children}
          </ScrollView>
        ) : (
          <YStack flex={1}>{children}</YStack>
        )}
      </YStack>
    </SafeAreaView>
  );
}

type LoadPage = (args: {
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
}) => Promise<ModelPage>;

type ModelPickerProps = {
  readonly open: boolean;
  readonly selectedId: string;
  readonly onClose: () => void;
  readonly onSelect: (model: PickerModel) => void;
  readonly models?: ReadonlyArray<PickerModel>;
  readonly loadPage?: LoadPage;
};

export function ModelPicker({
  open,
  models,
  selectedId,
  onClose,
  onSelect,
  loadPage,
}: ModelPickerProps) {
  const [query, setQuery] = useState("");
  const [pageModels, setPageModels] = useState<ReadonlyArray<PickerModel>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const requestIdRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const loadRef = useRef<LoadPage>(
    loadPage ??
      ((args) =>
        Promise.resolve(
          paginateModels(models ?? [], args.query, args.offset, args.limit),
        )),
  );
  loadRef.current =
    loadPage ??
    ((args) =>
      Promise.resolve(
        paginateModels(models ?? [], args.query, args.offset, args.limit),
      ));

  const fetchPage = useCallback(
    async (nextQuery: string, offset: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(undefined);
      try {
        const page = await loadRef.current({
          query: nextQuery.trim(),
          offset,
          limit: MODEL_PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) {
          return;
        }
        setPageModels((current) =>
          append ? [...current, ...page.models] : [...page.models],
        );
        setHasMore(page.hasMore);
      } catch (failure) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setError(formatRpcError(failure));
        if (!append) {
          setPageModels([]);
          setHasMore(false);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      setQuery("");
      setPageModels([]);
      setError(undefined);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      return;
    }
    setLoading(true);
    const delay = query.trim().length === 0 ? 0 : 300;
    const handle = setTimeout(() => {
      void fetchPage(query, 0, false);
    }, delay);
    return () => {
      clearTimeout(handle);
    };
  }, [fetchPage, open, query]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    void fetchPage(query, pageModels.length, true);
  }, [fetchPage, hasMore, loading, pageModels.length, query]);

  const renderItem = useCallback<ListRenderItem<PickerModel>>(
    ({ item }) => {
      const meta = modelRowMeta(item);
      return (
        <Button
          bg={item.id === selectedId ? "$color4" : undefined}
          chromeless
          justify="flex-start"
          mb="$2"
          onPress={() => {
            onSelect(item);
          }}
          size="$4"
          text="left"
          width="100%"
        >
          <XStack flex={1} items="center" justify="space-between" width="100%">
            <XStack flex={1} items="center" gap="$2" minW={0}>
              <ProviderMark
                color={item.iconColor}
                letter={item.company[0] ?? "?"}
              />
              <YStack flex={1} items="flex-start" minW={0}>
                <Text
                  color="$color10"
                  fontSize={12}
                  numberOfLines={1}
                  text="left"
                >
                  {item.company}
                </Text>
                <Text fontWeight="600" numberOfLines={1} text="left">
                  {item.name}
                </Text>
              </YStack>
            </XStack>
            {meta.context === undefined && meta.price === undefined ? null : (
              <YStack items="flex-end" pl="$2" shrink={0}>
                {meta.context === undefined ? null : (
                  <Text color="$color10" fontSize={12} text="right">
                    {meta.context}
                  </Text>
                )}
                {meta.price === undefined ? null : (
                  <Text color="$color10" fontSize={12} text="right">
                    {meta.price}
                  </Text>
                )}
              </YStack>
            )}
          </XStack>
        </Button>
      );
    },
    [onSelect, selectedId],
  );

  return (
    <PickerShell onClose={onClose} open={open} scroll={false} title="Model">
      <YStack flex={1} px="$3">
        <Input
          mb="$3"
          onChangeText={setQuery}
          placeholder="Search models"
          value={query}
        />
        {error === undefined ? null : (
          <Paragraph color="$red10" mb="$2">
            {error}
          </Paragraph>
        )}
        {loading && pageModels.length === 0 ? (
          <Spinner />
        ) : (
          <FlatList
            contentContainerStyle={{ paddingBottom: 24 }}
            data={pageModels}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Paragraph color="$color10">No models</Paragraph>
            }
            ListFooterComponent={
              loadingMore ? (
                <Spinner my="$3" />
              ) : hasMore ? (
                <Button mb="$3" onPress={loadMore} size="$3">
                  Load more
                </Button>
              ) : null
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            renderItem={renderItem}
            style={{ flex: 1 }}
          />
        )}
      </YStack>
    </PickerShell>
  );
}
