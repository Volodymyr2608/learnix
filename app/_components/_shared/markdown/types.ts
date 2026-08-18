import type { UrlTransform } from "react-markdown";

/**
 * react-markdown's own `urlTransform` signature, re-exported under the name the
 * policies use. Taking the type from the library rather than restating it is
 * what keeps a policy from silently drifting out of the shape the renderer
 * calls: the third argument is the node, and that is what makes a policy able
 * to treat an image differently from a link.
 */
export type UrlPolicy = UrlTransform;
