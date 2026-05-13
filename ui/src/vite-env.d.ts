/// <reference types="vite/client" />

// Make plain JSX intrinsic types available without the React import dance.
declare namespace JSX {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Element extends React.ReactElement {}
}
