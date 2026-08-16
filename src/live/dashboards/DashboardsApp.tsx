// DashboardsApp — the #/dashboards surface. A thin hash sub-router over the dashboards store:
// gallery (home), detail, settings, and an overview explainer. A shared top bar ties it to the
// other surfaces (Live, Gallery) so dashboards feel native, not bolted on. It rides the chosen
// theme and workspace skin like Live, and never touches the Demo or Live answer canvas.
import { useEffect, type ReactElement } from 'react';
import { DashTopBar } from './DashTopBar';
import { DashboardHome } from './DashboardHome';
import { dashHref, parseRoute, useHash } from './route';
import { applyTheme, readTheme } from '../../lib/theme';
import { createPreloadableLazy } from '../../lib/preloadableLazy';
import { AsyncSurface } from '../../components/AsyncSurface';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';
import './dashboards.css';
// The top bar carries the appearance TemplatePicker, and its trigger swatch + dropdown panel are
// styled in templates.css (which also carries the chosen workspace skin). Live and Present already
// load it; without it here a direct load of #/dashboards left the picker invisible (an empty
// control) and the surface ignoring the workspace skin the rest of the app honors.
import '../../styles/templates.css';

// Weekly Rewind and Present are pure delight, opened rarely — their own lazy chunks so visiting
// the everyday home/detail/settings views never pays for them.
const rewindOverlay = createPreloadableLazy(() =>
  import('./rewind/RewindOverlay').then((m) => ({ default: m.RewindOverlay })),
);
const dashPresent = createPreloadableLazy(() =>
  import('./DashPresent').then((m) => ({ default: m.DashPresent })),
);
const dashboardDetail = createPreloadableLazy(() =>
  import('./DashboardDetail').then((m) => ({ default: m.DashboardDetail })),
);
const dashboardSettings = createPreloadableLazy(() =>
  import('./DashboardSettings').then((m) => ({ default: m.DashboardSettings })),
);
const dashboardOverview = createPreloadableLazy(() =>
  import('./DashboardOverview').then((m) => ({ default: m.DashboardOverview })),
);
const RewindOverlay = rewindOverlay.Component;
const DashPresent = dashPresent.Component;
const DashboardDetail = dashboardDetail.Component;
const DashboardSettings = dashboardSettings.Component;
const DashboardOverview = dashboardOverview.Component;

function closeOverlay(): void {
  window.location.hash = dashHref.gallery;
}

export function DashboardsApp(): ReactElement {
  useEffect(() => applyTheme(readTheme()), []);
  const hash = useHash();
  const route = parseRoute(hash);

  if (route.view === 'present') {
    return (
      <AsyncSurface label="Dashboard presentation">
        <DashPresent onClose={closeOverlay} />
      </AsyncSurface>
    );
  }

  const body = (() => {
    switch (route.view) {
      case 'detail':
        return route.id ? (
          <AsyncSurface label="Dashboard detail">
            <DashboardDetail id={route.id} />
          </AsyncSurface>
        ) : (
          <DashboardHome />
        );
      case 'settings':
        return route.id ? (
          <AsyncSurface label="Dashboard settings">
            <DashboardSettings id={route.id} />
          </AsyncSurface>
        ) : (
          <DashboardHome />
        );
      case 'overview':
        return (
          <AsyncSurface label="Dashboard overview">
            <DashboardOverview />
          </AsyncSurface>
        );
      case 'rewind':
      case 'gallery':
      default:
        return <DashboardHome />;
    }
  })();

  return (
    <div className="mavea-app dash-app">
      <DashTopBar view={route.view} />
      <FeatureUseNotice kind="monitoring" className="dash-risk-note" />
      {body}
      {route.view === 'rewind' && (
        <AsyncSurface label="Weekly rewind" overlay>
          <RewindOverlay onClose={closeOverlay} />
        </AsyncSurface>
      )}
    </div>
  );
}
