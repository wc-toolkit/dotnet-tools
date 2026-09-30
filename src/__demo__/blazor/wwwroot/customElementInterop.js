window.customElementInterop = {
  _listeners: new WeakMap(),

  bindEvents(element, dotNetRef, eventNames) {
    const handlers = {};

    for (const eventName of eventNames) {
      const handler = (event) => {
        dotNetRef.invokeMethodAsync(
          `Handle${eventName
            .split("-")
            .map((part) => part[0].toUpperCase() + part.slice(1))
            .join("")}`,
          {
            type: event.type,
            detail: event.detail ?? null,
          },
        );
      };

      element.addEventListener(eventName, handler);
      handlers[eventName] = handler;
    }

    this._listeners.set(element, handlers);
  },

  unbindEvents(element) {
    const handlers = this._listeners.get(element);
    if (!handlers) return;

    for (const [eventName, handler] of Object.entries(handlers)) {
      element.removeEventListener(eventName, handler);
    }

    this._listeners.delete(element);
  },

  invokeMethod(element, methodName, args) {
    return element[methodName](...(args ?? []));
  },

  syncProperty(element, propertyName, value) {
    if (element[propertyName] !== value) element[propertyName] = value;
  },
};
