export type OrganizationRole = 'owner' | 'administrator' | 'read_only';

export type SessionUser = {
  ID: string;
  firstname: string;
  lastname: string;
  role: OrganizationRole;
  isAdmin: boolean;
  isOwner: boolean;
  email: string;
};

export type Session = {
  user: SessionUser;
  isAdmin?: boolean;
  tenantId?: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  sessionExpiresAt?: string;
};

export type SessionOrganization = {
  tenantId: string;
  name: string;
  accountNo: string;
  role: OrganizationRole;
  isCurrent: boolean;
};

export type SessionOrganizations = { organizations: SessionOrganization[] };

export type PushPreferences = { monitorDown: boolean; probeOffline: boolean };

export type NotificationInboxItem = {
  id: string;
  eventType: 'monitor_down' | 'probe_offline';
  resourceType: 'monitor' | 'probe';
  resourceId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type NotificationInboxPage = {
  records: NotificationInboxItem[];
  total: number;
  unread: number;
  offset: number;
  limit: number;
};

export type LoginChallenge = {
  user: SessionUser;
  tenantId?: string;
  accessToken?: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  mfaEnrollmentRequired?: boolean;
  mfaChallengeToken?: string;
  mfaChallengeExpiresAt?: string;
};

export type StatusSummary = {
  lastUpdated: string;
  totalMonitors: number;
  upMonitors: number;
  downMonitors: number;
  attentionMonitors: number;
  unknownMonitors: number;
};

export type Monitor = {
  ID: string;
  kind?: string;
  targetID: string;
  monitorID?: string;
  label: string;
  monitorLabel: string;
  displayName?: string;
  host: string;
  type: string;
  status: string;
  statusMessage: string;
  rtt: string;
  probeName: string;
  lastChecked: string;
  tags: string[];
  liveMetric?: { kind: string; label: string; value: number | null; unit?: string };
  path?: { hopCount?: number | null; latencyMs?: number | null; packetLossPercent?: number | null };
  snmp?: { endpointID?: string; healthMetric?: { key: string; label: string; severity: string; value: number | null; unit: string } | null };
  flow?: { exporterID?: string; throughputBps?: number | null; flowsPerSecond?: number | null };
  syslog?: { sourceID: string };
  lastCheckedAt?: string | null;
};

export type MonitorPage = { offset: number; limit: number; total: number; records: Monitor[]; summary?: StatusSummary };

export type TargetStatus = {
  ID: string; targetID: string; label: string; address: string; status: string;
  statusMessage: string; monitorCount: number; affectedCount: number;
  tags: string[]; probe?: { name?: string }; monitors?: Monitor[];
};
export type TargetStatusPage = { offset: number; limit: number; total: number; records: TargetStatus[]; summary?: { totalTargets: number; healthyTargets: number; affectedTargets: number; downTargets: number; unknownTargets: number } };

export type ServiceStatus = {
  ID: string; serviceID: string; label: string; status: string;
  statusMessage: string; monitoringLimited: boolean; customerImpact: string;
  probableCause: string; metric: { kind: string; caption: string; label: string; value?: number | null; coverage?: AvailabilityCoverage };
};
export type ServiceStatusPage = { lastUpdated?: string; offset: number; limit: number; total: number; records: ServiceStatus[]; summary?: { totalServices: number; healthyServices: number; degradedServices: number; downServices: number; unknownServices: number } };

export type Incident = {
  id: string;
  kind?: 'monitor' | 'service' | 'probe' | 'apm';
  applicationId?: string | null;
  serviceID?: string;
  serviceName?: string;
  probeID?: string;
  severity?: string;
  status: string;
  targetID: string;
  monitorID: string;
  label: string;
  monitorLabel: string;
  host: string;
  type: string;
  rootCause: string;
  startedAt: string;
  resolvedAt?: string | null;
  duration: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string | null;
  acknowledgementNote?: string;
};

export type IncidentPage = { lastUpdated: string; total: number; page: number; pageSize: number; incidents: Incident[] };

export type AttentionItem = { id: string; severity: string; header: string; message: string; actionText: string };
export type AttentionCenter = { count: number; items: AttentionItem[] };

export type MaintenanceWindow = {
  id: string;
  name: string;
  description: string;
  status: string;
  recurrence: string;
  repeatLabel: string;
  timezone: string;
  targetCount: number;
  schedule: { startDate: string; startTime: string; endDate: string; endTime: string };
};
export type MaintenanceView = { header: { total: number; active: number; upcoming: number }; records: MaintenanceWindow[] };

export type Probe = {
  id: string;
  status: string;
  name: string;
  hostname?: string;
  location: string;
  lastSeen: string;
  privateIp: string;
  publicIp: string;
  os: string;
  assignedWork: { targetCount: number; monitorCount: number };
  software: { installedVersion: string; state: string; statusMessage: string };
};
export type ProbeView = { generatedAt: string; probes: Probe[]; total: number; offset: number; limit: number };

export type AvailabilityCoverage = { percent: number; knownSeconds: number; unknownSeconds: number };
export type OrganizationModules = { modules: { key: string; name: string; enabled: boolean; available: boolean }[] };
