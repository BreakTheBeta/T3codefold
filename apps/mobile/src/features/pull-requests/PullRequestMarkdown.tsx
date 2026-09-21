import type { AssetResource, EnvironmentId } from "@t3tools/contracts";
import { githubMediaFetchUrl } from "@t3tools/shared/githubMedia";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Markdown } from "react-native-nitro-markdown";

import type { FilePreviewSource } from "../../components/FilePreviewModal";
import { FilePreviewModal } from "../../components/FilePreviewModal";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import {
  hasNativeSelectableMarkdownText,
  SelectableMarkdownText,
  type MarkdownImageRenderer,
} from "../../native/SelectableMarkdownText";
import { useAssetUrlState } from "../../state/assets";
import { useMarkdownPreviewStyles } from "../files/FileMarkdownPreview";
import { ThreadMarkdownImageView } from "../threads/ThreadMarkdownImage";
import { markdownImagesFromHtml, resolveMarkdownImageUrl } from "./pullRequestMarkdown.logic";

/**
 * Where a pull request's media is read from: the environment answering for it and the checkout
 * whose GitHub credential can fetch a private repository's uploads.
 */
export const PullRequestMediaContext = createContext<{
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
} | null>(null);

type OpenPreview = (source: FilePreviewSource) => void;

/**
 * An upload GitHub hosts for the repository. A private repository answers only a request that
 * carries a credential, so the server fetches it and hands back a signed URL; a server that
 * cannot still leaves a public repository's image loading directly, as on desktop.
 */
function GitHubMediaImage(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly url: string;
  readonly fetchUrl: string;
  readonly alt: string | null;
  readonly onPressPreview: OpenPreview;
}) {
  const resource = useMemo<AssetResource>(
    () => ({ _tag: "github-media", cwd: props.cwd, url: props.fetchUrl }),
    [props.cwd, props.fetchUrl],
  );
  const assetUrl = useAssetUrlState(props.environmentId, resource);
  const uri =
    assetUrl._tag === "Success" ? assetUrl.url : assetUrl._tag === "Failure" ? props.url : null;
  return (
    <ThreadMarkdownImageView
      uri={uri}
      sourceKey={`github-media:${props.fetchUrl}`}
      unavailable={false}
      knownSize={assetUrl._tag === "Success" ? assetUrl.imageDimensions : undefined}
      alt={props.alt}
      actionsSource={{
        environmentId: props.environmentId,
        resource,
        name: props.alt || "Pull request image",
        mimeType: "image/*",
      }}
      onPressPreview={props.onPressPreview}
    />
  );
}

/**
 * A PR description or remark, laid out inline with the rest of the page. Images render in place
 * and open full screen with pinch and double-tap zoom.
 */
export function PullRequestMarkdown(props: { readonly markdown: string }) {
  const media = useContext(PullRequestMediaContext);
  const [preview, setPreview] = useState<FilePreviewSource | null>(null);
  const renderImage = useCallback<MarkdownImageRenderer>(
    (image) => {
      const url = resolveMarkdownImageUrl(image.href);
      if (url === null) return null;
      const fetchUrl = githubMediaFetchUrl(url);
      if (fetchUrl !== null && media !== null) {
        return (
          <GitHubMediaImage
            environmentId={media.environmentId}
            cwd={media.cwd}
            url={url}
            fetchUrl={fetchUrl}
            alt={image.alt}
            onPressPreview={setPreview}
          />
        );
      }
      return (
        <ThreadMarkdownImageView
          uri={url}
          sourceKey={url}
          unavailable={false}
          alt={image.alt}
          actionsSource={{ uri: url, name: image.alt || "Pull request image", mimeType: "image/*" }}
          onPressPreview={setPreview}
        />
      );
    },
    [media],
  );
  const styles = useMarkdownPreviewStyles(renderImage);
  const markdown = useMemo(() => markdownImagesFromHtml(props.markdown), [props.markdown]);
  const onLinkPress = useCallback((href: string) => {
    void tryOpenExternalUrl(href, "markdown-link");
  }, []);

  return (
    <>
      {hasNativeSelectableMarkdownText() ? (
        <SelectableMarkdownText
          markdown={markdown}
          onLinkPress={onLinkPress}
          renderImage={renderImage}
          textStyle={styles.nativeTextStyle}
        />
      ) : (
        <Markdown
          options={{ gfm: true }}
          renderers={styles.renderers}
          styles={styles.styles}
          theme={styles.theme}
        >
          {markdown}
        </Markdown>
      )}
      <FilePreviewModal source={preview} onRequestClose={() => setPreview(null)} />
    </>
  );
}
