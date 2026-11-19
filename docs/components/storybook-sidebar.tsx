// A drawing of Storybook's sidebar, for the docs: how a stories file and its features are listed
// (its roots, groups, components, docs pages and stories, with icons like Storybook's). An
// illustration only: static, every node open.
import type { CSSProperties, ReactNode } from "react";

/** A node of the sidebar: what Storybook calls it, its label and what's under it. */
export interface SidebarNode {
  kind: "root" | "group" | "component" | "docs" | "story";
  name: string;
  children?: SidebarNode[];
}

/** Each kind's icon color, close to Storybook's own. */
const colors: Record<Exclude<SidebarNode["kind"], "root">, string> = {
  group: "#8b6fd6",
  component: "#029cfd",
  docs: "#ff8300",
  story: "#1ea7a4",
};

const icon = (path: ReactNode, color: string) => (
  <svg
    viewBox="0 0 14 14"
    width="14"
    height="14"
    aria-hidden="true"
    fill="none"
    stroke={color}
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: "none" }}
  >
    {path}
  </svg>
);

/** The icon of each kind of node: a folder, a component's four squares, a page, a bookmark. */
const icons: Record<Exclude<SidebarNode["kind"], "root">, ReactNode> = {
  group: icon(
    <path d="M1.5 3.5h3.6l1.2 1.5h6.2v6.5h-11z" />,
    colors.group,
  ),
  component: icon(
    <>
      <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" />
      <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" />
      <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" />
      <rect x="8" y="8" width="4.5" height="4.5" rx="1" />
    </>,
    colors.component,
  ),
  docs: icon(
    <>
      <path d="M3 1.5h5.5l2.5 2.5v8.5h-8z" />
      <path d="M5 6.5h4M5 8.5h4M5 10.5h2.5" />
    </>,
    colors.docs,
  ),
  story: icon(<path d="M4 1.5h6v11l-3-2.6-3 2.6z" />, colors.story),
};

/** The small arrow of an open node. */
const caret = (
  <svg
    viewBox="0 0 8 8"
    width="8"
    height="8"
    aria-hidden="true"
    style={{ flex: "none", opacity: 0.55 }}
  >
    <path d="M1 2.5h6L4 6z" fill="currentColor" />
  </svg>
);

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  minHeight: "1.75rem",
  fontSize: "0.875rem",
  lineHeight: 1.2,
};

const list: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };

function Node({ node, depth }: { node: SidebarNode; depth: number }) {
  const { kind, name, children = [] } = node;
  if (kind === "root") {
    return (
      <li>
        <div
          style={{
            ...row,
            fontSize: "0.6875rem",
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            opacity: 0.6,
          }}
        >
          {caret}
          {name}
        </div>
        <ul style={list}>
          {children.map((child) => (
            <Node key={child.name} node={child} depth={depth} />
          ))}
        </ul>
      </li>
    );
  }
  // A node that opens has an arrow where a leaf has its indent.
  const opens = kind === "group" || kind === "component";
  return (
    <li>
      <div style={{ ...row, paddingLeft: `${String(depth * 1.1)}rem` }}>
        {opens ? caret : <span style={{ width: 8, flex: "none" }} />}
        {icons[kind]}
        <span>{name}</span>
      </div>
      {children.length > 0 && (
        <ul style={list}>
          {children.map((child) => (
            <Node key={child.name} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Storybook's sidebar with `tree` in it, every node open. */
export function StorybookSidebar({ tree }: { tree: SidebarNode[] }) {
  return (
    <div
      role="img"
      aria-label="Storybook's sidebar"
      style={{
        display: "inline-block",
        minWidth: "17rem",
        marginTop: "1.25rem",
        padding: "0.75rem 1.25rem 0.75rem 0.9rem",
        borderRadius: "0.6rem",
        border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
        background: "color-mix(in srgb, currentColor 4%, transparent)",
      }}
    >
      <ul style={list}>
        {tree.map((node) => (
          <Node key={node.name} node={node} depth={0} />
        ))}
      </ul>
    </div>
  );
}
