/**
 * Compatibility import for existing admin reports and cleanup scripts. The
 * dependency-free implementation lives in a neutral module so public trust
 * gates do not import through the privileged admin namespace.
 */
export { findPlaceholderMarkers } from "../content/placeholderCopy";
