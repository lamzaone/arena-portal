export type PortalThemeSurface =
  | "global"
  | "profile"
  | "smallProfile"
  | "playerContainer";

/**
 * Source-controlled renderer keys. Theme manifests stay plain serializable
 * data so repository and route modules never pull React client components
 * into their server dependency graph.
 */
export type PortalThemeIconKey = "crown" | "zap";
export type PortalThemeBackgroundKey = "tapGodRain";

export type PortalThemeBadge = {
  className: string;
  detail: string;
  icon: PortalThemeIconKey;
  label: string;
};

export type PortalThemeDocumentEffects = {
  cursorGrid?: "hidden" | "visible";
};

export type PortalThemeAvatarAdornment = {
  className: string;
  icon: PortalThemeIconKey;
};

export type PortalThemeSurfaceBase = {
  className: string;
  badge?: PortalThemeBadge;
};

export type PortalThemeGlobalSurface = PortalThemeSurfaceBase & {
  background?: PortalThemeBackgroundKey;
  documentEffects?: PortalThemeDocumentEffects;
};

export type PortalThemeProfileSurface = PortalThemeSurfaceBase & {
  avatarAdornment?: PortalThemeAvatarAdornment;
  background?: PortalThemeBackgroundKey;
  documentEffects?: PortalThemeDocumentEffects;
};

export type PortalThemeSmallProfileSurface = PortalThemeSurfaceBase;
export type PortalThemePlayerContainerSurface = PortalThemeSurfaceBase;

export type PortalThemeSurfaceMap = {
  global: PortalThemeGlobalSurface;
  profile: PortalThemeProfileSurface;
  smallProfile: PortalThemeSmallProfileSurface;
  playerContainer: PortalThemePlayerContainerSurface;
};

export type PortalThemeDefinition = {
  key: string;
  displayName: string;
  previewImageUrl: string | null;
  surfaces: {
    [Surface in PortalThemeSurface]: PortalThemeSurfaceMap[Surface] | false;
  };
};

export type PortalThemeSurfaceDefinition =
  | PortalThemeGlobalSurface
  | PortalThemeProfileSurface
  | PortalThemeSmallProfileSurface
  | PortalThemePlayerContainerSurface;
