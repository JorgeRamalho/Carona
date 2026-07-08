const caronaMaps = {
  config: null,
  map: null,
  modalMap: null,
  modalDirectionsRenderer: null,
  markers: [],
  modalMarkers: [],
  polyline: null,
  modalPolyline: null,
  scriptPromise: null,

  async init() {
    if (this.config) return this.config;
    this.config = await api.request('/api/maps/config');
    if (this.config.enabled && this.config.apiKey) {
      await this.loadScript();
    }
    return this.config;
  },

  loadScript() {
    if (window.google?.maps) return Promise.resolve();
    if (this.scriptPromise) return this.scriptPromise;

    this.scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.config.apiKey}&libraries=places,geometry&language=pt-BR&region=BR`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Não foi possível carregar o Google Maps.'));
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  },

  setupAutocomplete(input) {
    if (!window.google?.maps?.places) return;
    const autocomplete = new google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: 'br' },
      fields: ['formatted_address', 'geometry', 'name']
    });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) input.value = place.formatted_address;
    });
  },

  bindAddressInputs(origemId, destinoId) {
    const origem = document.getElementById(origemId);
    const destino = document.getElementById(destinoId);
    if (origem) this.setupAutocomplete(origem);
    if (destino) this.setupAutocomplete(destino);
  },

  clearMap(target = 'main') {
    const isModal = target === 'modal';
    const markers = isModal ? this.modalMarkers : this.markers;
    const polyline = isModal ? this.modalPolyline : this.polyline;

    markers.forEach((marker) => marker.setMap(null));
    if (isModal) this.modalMarkers = [];
    else this.markers = [];

    if (polyline) {
      polyline.setMap(null);
      if (isModal) this.modalPolyline = null;
      else this.polyline = null;
    }
  },

  renderRoute(containerId, routeData, options = {}) {
    const isModal = options.instance === 'modal';
    const mapKey = isModal ? 'modalMap' : 'map';
    const markerKey = isModal ? 'modalMarkers' : 'markers';
    const polylineKey = isModal ? 'modalPolyline' : 'polyline';
    const target = isModal ? 'modal' : 'main';
    const container = document.getElementById(containerId);
    if (!container || !routeData) return;

    container.hidden = false;

    if (!this.config?.enabled || !window.google?.maps) {
      container.innerHTML = `
        <div class="map-fallback">
          <p>🗺️ Rota calculada${routeData.mapsFonte === 'google' ? ' pelo Google Maps' : ''}</p>
          <p><strong>${routeData.distancia} km</strong> · <strong>${routeData.duracaoTexto || formatDuration(routeData.duracaoSegundos)}</strong></p>
          ${routeData.mapsUrl ? `<a href="${routeData.mapsUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Abrir no Google Maps</a>` : ''}
        </div>
      `;
      return;
    }

    if (!this[mapKey] || this[mapKey].getDiv() !== container) {
      container.innerHTML = '';
      this[mapKey] = new google.maps.Map(container, {
        center: { lat: -25.4284, lng: -49.2733 },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: !isModal
      });
    }

    this.clearMap(target);

    const bounds = new google.maps.LatLngBounds();
    const hasCoords = routeData.origemLat && routeData.destinoLat;

    if (hasCoords) {
      const origin = { lat: routeData.origemLat, lng: routeData.origemLng };
      const destination = { lat: routeData.destinoLat, lng: routeData.destinoLng };

      this[markerKey].push(new google.maps.Marker({
        map: this[mapKey],
        position: origin,
        label: 'A',
        title: 'Origem'
      }));
      this[markerKey].push(new google.maps.Marker({
        map: this[mapKey],
        position: destination,
        label: 'B',
        title: 'Destino'
      }));

      bounds.extend(origin);
      bounds.extend(destination);
    }

    if (routeData.rotaPolyline && google.maps.geometry?.encoding) {
      const path = google.maps.geometry.encoding.decodePath(routeData.rotaPolyline);
      this[polylineKey] = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#22C55E',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map: this[mapKey]
      });
      path.forEach((point) => bounds.extend(point));
    }

    if (!bounds.isEmpty()) {
      this[mapKey].fitBounds(bounds, 48);
    }

    if (isModal && window.google?.maps) {
      setTimeout(() => google.maps.event.trigger(this[mapKey], 'resize'), 200);
    }

    if (routeData.mapsUrl && !options.skipActions && !isModal) {
      let actions = container.parentElement?.querySelector('.map-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'map-actions';
        container.insertAdjacentElement('afterend', actions);
      }
      actions.innerHTML = `
        <a href="${routeData.mapsUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
          🧭 Abrir melhor rota no Google Maps
        </a>
        <span class="map-meta">${routeData.distancia} km · ${routeData.duracaoTexto || formatDuration(routeData.duracaoSegundos)}</span>
      `;
    }
  },

  buildEmbedUrl(origem, destino) {
    if (this.config?.apiKey) {
      const url = new URL('https://www.google.com/maps/embed/v1/directions');
      url.searchParams.set('key', this.config.apiKey);
      url.searchParams.set('origin', origem);
      url.searchParams.set('destination', destino);
      url.searchParams.set('mode', 'driving');
      url.searchParams.set('language', 'pt-BR');
      return url.toString();
    }

    const url = new URL('https://maps.google.com/maps');
    url.searchParams.set('saddr', origem);
    url.searchParams.set('daddr', destino);
    url.searchParams.set('dirflg', 'd');
    url.searchParams.set('hl', 'pt-BR');
    url.searchParams.set('output', 'embed');
    return url.toString();
  },

  renderEmbedMap(container, origem, destino) {
    container.innerHTML = `
      <iframe
        class="google-maps-embed"
        title="Rota no Google Maps"
        src="${this.buildEmbedUrl(origem, destino)}"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        allowfullscreen
        style="border:0;border-radius:14px;width:100%;height:100%;display:block;"
      ></iframe>
    `;
  },

  renderModalRoute(containerId, routeData, origem, destino) {
    const container = document.getElementById(containerId);
    if (!container || !origem || !destino) return;

    container.hidden = false;
    this.modalDirectionsRenderer = null;
    this.clearMap('modal');

    const drawInteractiveRoute = () => {
      if (!window.google?.maps) return false;

      container.innerHTML = '';
      this.modalMap = new google.maps.Map(container, {
        center: { lat: -25.4284, lng: -49.2733 },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
      });

      this.modalDirectionsRenderer = new google.maps.DirectionsRenderer({
        map: this.modalMap,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: '#22C55E',
          strokeOpacity: 0.9,
          strokeWeight: 5
        }
      });

      const service = new google.maps.DirectionsService();
      service.route(
        {
          origin: origem,
          destination: destino,
          travelMode: google.maps.TravelMode.DRIVING
        },
        (result, status) => {
          if (status === 'OK') {
            this.modalDirectionsRenderer.setDirections(result);
            setTimeout(() => google.maps.event.trigger(this.modalMap, 'resize'), 150);
            return;
          }
          this.renderEmbedMap(container, origem, destino);
        }
      );

      return true;
    };

    if (this.config?.enabled && drawInteractiveRoute()) return;
    this.renderEmbedMap(container, origem, destino);
  }
};

window.caronaMaps = caronaMaps;
