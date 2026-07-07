import { useEffect, useMemo, useState } from 'react';
import {
  deleteCamera,
  fetchCameras,
  fetchClips,
  fetchStatus,
  fetchSystem,
  getApiBase,
  type Camera,
  type CameraRegistry,
  type Clip,
  type SystemSnapshot,
} from './api/client';
import { AddCameraModal } from './components/AddCameraModal';
import { AuthGate } from './components/AuthGate';
import { CameraEventWorkspace } from './components/CameraEventWorkspace';
import { CameraManagementPanel } from './components/CameraManagementPanel';
import { DashboardShell, type ScreenId } from './components/DashboardShell';
import { DeleteCameraDialog } from './components/DeleteCameraDialog';
import { DetectionSettingsForm } from './components/DetectionSettingsForm';
import { getBackendStatus } from './components/StatusBadge';
import { StorageGauge, SystemPanel } from './components/SystemPanels';
import { extractEvents, extractHeartbeat } from './statusFeed';

export function upsertCameraInRegistry(registry: CameraRegistry, camera: Camera, previousCameraId?: string): CameraRegistry {
  const replacementIds = new Set([camera.id, camera.backend_camera_id, previousCameraId].filter((value): value is string => Boolean(value)));
  return {
    registry_version: registry.registry_version + 1,
    cameras: [
      camera,
      ...registry.cameras.filter((item) => {
        if (replacementIds.has(item.id)) return false;
        if (item.backend_camera_id && replacementIds.has(item.backend_camera_id)) return false;
        return true;
      }),
    ],
  };
}

const apiBase = getApiBase();

function Dashboard(): JSX.Element {
  const [screen, setScreen] = useState<ScreenId>('home');
  const [registry, setRegistry] = useState<CameraRegistry>({ registry_version: 0, cameras: [] });
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<unknown>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [clipsError, setClipsError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);

  const backendStatus = getBackendStatus(system);
  const events = useMemo(() => extractEvents(statusSnapshot), [statusSnapshot]);
  const heartbeat = useMemo(() => extractHeartbeat(statusSnapshot), [statusSnapshot]);

  useEffect(() => {
    let active = true;

    async function loadCameras(): Promise<void> {
      try {
        const nextRegistry = await fetchCameras();
        if (active) {
          setRegistry(nextRegistry);
          setCameraError(null);
        }
      } catch {
        if (active) setCameraError('카메라 목록을 불러오지 못했습니다.');
      }
    }

    void loadCameras();
    const timer = window.setInterval(loadCameras, 5_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setSelectedCameraId((current) => {
      if (current && registry.cameras.some((camera) => camera.id === current)) return current;
      return registry.cameras[0]?.id ?? null;
    });
  }, [registry.cameras]);

  useEffect(() => {
    let active = true;

    async function loadStatus(): Promise<void> {
      try {
        const snapshot = await fetchStatus();
        if (active) {
          setStatusSnapshot(snapshot);
          setStatusError(null);
        }
      } catch {
        if (active) setStatusError('실시간 상태를 불러오지 못했습니다.');
      }
    }

    void loadStatus();
    const timer = window.setInterval(loadStatus, 3_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSystem(): Promise<void> {
      try {
        const snapshot = await fetchSystem();
        if (active) {
          setSystem(snapshot);
          setSystemError(null);
        }
      } catch {
        if (active) setSystemError('시스템 상태를 불러오지 못했습니다.');
      }
    }

    void loadSystem();
    const timer = window.setInterval(loadSystem, 10_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadClips(): Promise<void> {
      if (!selectedCameraId) {
        setClips([]);
        setClipsError(null);
        return;
      }
      try {
        const nextClips = await fetchClips(selectedCameraId);
        if (active) {
          setClips(nextClips);
          setClipsError(null);
        }
      } catch {
        if (active) setClipsError('클립 목록을 불러오지 못했습니다.');
      }
    }

    void loadClips();
    const timer = window.setInterval(loadClips, 8_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedCameraId]);

  function upsertCamera(camera: Camera, previousCameraId?: string): void {
    setRegistry((current) => upsertCameraInRegistry(current, camera, previousCameraId));
    setSelectedCameraId(camera.id);
  }

  function handleClipChanged(clip: Clip): void {
    setClips((current) => current.map((item) => (item.id === clip.id ? clip : item)));
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleteMessage(null);
    try {
      await deleteCamera(deleteTarget.id);
      setRegistry((current) => ({
        registry_version: current.registry_version + 1,
        cameras: current.cameras.filter((camera) => camera.id !== deleteTarget.id),
      }));
      if (selectedCameraId === deleteTarget.id) setSelectedCameraId(null);
      setDeleteTarget(null);
    } catch {
      setDeleteMessage('카메라 삭제에 실패했습니다. 참조 중인 이벤트나 권한을 확인하세요.');
    }
  }

  const cameraPanel = (
    <CameraManagementPanel
      registry={registry}
      cameraError={cameraError}
      onAddCamera={() => setModalOpen(true)}
      onUpdated={upsertCamera}
      onDelete={setDeleteTarget}
    />
  );

  const eventPanel = (
    <CameraEventWorkspace
      cameras={registry.cameras}
      events={events}
      clips={clips}
      heartbeat={heartbeat}
      statusError={statusError}
      clipsError={clipsError}
      onClipChanged={handleClipChanged}
      selectedCameraId={selectedCameraId}
      onSelectedCameraChange={setSelectedCameraId}
    />
  );

  const systemPanel = (
    <SystemPanel
      apiBase={apiBase}
      system={system}
      systemError={systemError}
      backendStatus={backendStatus}
      events={events}
    />
  );

  const activeScreen = (
    <>
          {screen === 'home' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)]">
              <div className="space-y-6">{cameraPanel}</div>
              <div className="space-y-6">
                {eventPanel}
                <StorageGauge system={system} />
              </div>
            </div>
          ) : null}
          {screen === 'cameras' ? cameraPanel : null}
          {screen === 'events' ? <div className="space-y-6">{eventPanel}</div> : null}
          {screen === 'system' ? systemPanel : null}
          {screen === 'settings' ? <DetectionSettingsForm cameras={registry.cameras} /> : null}
    </>
  );

  return (
    <>
      <DashboardShell
        apiBase={apiBase}
        backendStatus={backendStatus}
        screen={screen}
        onScreenChange={setScreen}
        onAddCamera={() => setModalOpen(true)}
      >
        {activeScreen}
      </DashboardShell>

      <AddCameraModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={upsertCamera} />

      {deleteTarget ? (
        <DeleteCameraDialog
          camera={deleteTarget}
          message={deleteMessage}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </>
  );
}

export default function App(): JSX.Element {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
