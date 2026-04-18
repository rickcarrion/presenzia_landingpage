document.addEventListener("DOMContentLoaded", function () {
  var revealNodes = document.querySelectorAll("[data-reveal]");

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.18,
      rootMargin: "0px 0px -40px 0px"
    });

    revealNodes.forEach(function (node) {
      observer.observe(node);
    });
  } else {
    revealNodes.forEach(function (node) {
      node.classList.add("is-visible");
    });
  }

  var currentHash = window.location.hash;
  document.querySelectorAll(".lang-option").forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (!currentHash) {
        return;
      }

      event.preventDefault();
      var url = new URL(link.getAttribute("href"), window.location.href);
      url.hash = currentHash;
      window.location.href = url.href;
    });
  });

  document.querySelectorAll(".contact-form").forEach(function (form) {
    var submitButton = form.querySelector('button[type="submit"]');
    var progressButton = form.querySelector("[data-progress-button]");
    var progressButtonLabel = form.querySelector("[data-progress-button-label]");
    var dynamicPlaceholderTimers = [];

    var clearDynamicPlaceholderTimers = function () {
      dynamicPlaceholderTimers.forEach(function (timerId) {
        window.clearTimeout(timerId);
      });
      dynamicPlaceholderTimers = [];
    };

    var queueDynamicPlaceholderTimer = function (callback, delay) {
      var timerId = window.setTimeout(callback, delay);
      dynamicPlaceholderTimers.push(timerId);
      return timerId;
    };

    var setupDynamicPlaceholder = function (field) {
      var rawValues = field.getAttribute("data-dynamic-placeholders");
      var values;
      var activeIndex = 0;
      var charIndex = 0;
      var deleting = false;
      var paused = false;

      if (!rawValues) {
        return;
      }

      values = rawValues.split("|").map(function (item) {
        return item.trim();
      }).filter(Boolean);

      if (!values.length) {
        return;
      }

      var tick = function () {
        var currentValue;
        var nextDelay;

        if (paused || String(field.value || "").trim() !== "") {
          return;
        }

        currentValue = values[activeIndex];

        if (!deleting) {
          charIndex += 1;
          field.setAttribute("placeholder", currentValue.slice(0, charIndex));

          if (charIndex >= currentValue.length) {
            deleting = true;
            nextDelay = 1350;
          } else {
            nextDelay = 75;
          }
        } else {
          charIndex -= 1;
          field.setAttribute("placeholder", currentValue.slice(0, Math.max(charIndex, 0)));

          if (charIndex <= 0) {
            deleting = false;
            activeIndex = (activeIndex + 1) % values.length;
            nextDelay = 280;
          } else {
            nextDelay = 40;
          }
        }

        queueDynamicPlaceholderTimer(tick, nextDelay);
      };

      field.addEventListener("focus", function () {
        paused = true;
      });

      field.addEventListener("blur", function () {
        if (String(field.value || "").trim() !== "") {
          return;
        }

        paused = false;
        clearDynamicPlaceholderTimers();
        queueDynamicPlaceholderTimer(tick, 180);
      });

      field.addEventListener("input", function () {
        clearDynamicPlaceholderTimers();

        if (String(field.value || "").trim() !== "") {
          field.setAttribute("placeholder", "");
          return;
        }

        paused = false;
        activeIndex = 0;
        charIndex = 0;
        deleting = false;
        queueDynamicPlaceholderTimer(tick, 180);
      });

      field.setAttribute("placeholder", "");
      queueDynamicPlaceholderTimer(tick, 320);
    };

    var getActiveRequiredFields = function () {
      return Array.from(form.querySelectorAll("input[required], select[required], textarea[required]")).filter(function (field) {
        return !field.disabled;
      });
    };

    var getFieldLabelNode = function (field) {
      return field.id ? form.querySelector('label[for="' + field.id + '"]') : null;
    };

    var syncFieldLabelStatus = function (field, isComplete) {
      var label = getFieldLabelNode(field);
      var indicator;

      if (!label) {
        return;
      }

      indicator = label.querySelector(".field-label__status");

      if (isComplete) {
        if (indicator) {
          indicator.remove();
        }
        return;
      }

      if (!indicator) {
        indicator = document.createElement("span");
        indicator.className = "field-label__status";
        indicator.setAttribute("aria-hidden", "true");
        label.appendChild(indicator);
      }
    };

    var renderProgress = function () {
      var fields = getActiveRequiredFields();
      var completed = 0;

      fields.forEach(function (field) {
        var isComplete = field.checkValidity() && String(field.value || "").trim() !== "";

        if (isComplete) {
          completed += 1;
        }

        syncFieldLabelStatus(field, isComplete);
      });

      if (progressButton) {
        var progressPercent = fields.length ? (completed / fields.length) * 100 : 0;
        var lockedTemplate = progressButton.getAttribute("data-locked-template") || "{completed}/{total}";
        var readyLabel = progressButton.getAttribute("data-ready-label") || "Ready";
        progressButton.style.setProperty("--progress", String(progressPercent) + "%");

        if (progressButtonLabel) {
          progressButtonLabel.textContent = completed === fields.length && fields.length > 0
            ? readyLabel
            : lockedTemplate.replace("{completed}", String(completed)).replace("{total}", String(fields.length));
        }
      }
    };

    var syncSubmitState = function () {
      if (submitButton) {
        submitButton.disabled = !form.checkValidity();
      }

      renderProgress();
    };

    ["profession", "country"].forEach(function (fieldName) {
      var select = form.querySelector('[name="' + fieldName + '"]');
      var customField = form.querySelector('[data-custom-field="' + fieldName + '"]');
      var customInput = form.querySelector('[name="' + fieldName + '_other"]');

      if (!select || !customField || !customInput) {
        return;
      }

      var syncCustomField = function () {
        var useCustomValue = select.value === "other";
        customField.hidden = !useCustomValue;
        customInput.required = useCustomValue;
        customInput.disabled = !useCustomValue;

        if (!useCustomValue) {
          customInput.value = "";
        }

        syncSubmitState();
      };

      select.addEventListener("change", syncCustomField);
      syncCustomField();
    });

    form.querySelectorAll("input, select, textarea").forEach(function (field) {
      var updateFormState = function () {
        var status = form.querySelector(".form-status");
        if (status) {
          status.textContent = "";
        }
        syncSubmitState();
      };

      field.addEventListener("input", updateFormState);
      field.addEventListener("change", updateFormState);
    });

    form.querySelectorAll("input[data-dynamic-placeholders]").forEach(function (field) {
      setupDynamicPlaceholder(field);
    });

    syncSubmitState();

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var status = form.querySelector(".form-status");
      if (!form.reportValidity()) {
        return;
      }

      var formData = new FormData(form);
      var firstName = String(formData.get("first_name") || "").trim();
      var lastName = String(formData.get("last_name") || "").trim();
      var profession = String(formData.get("profession") || "").trim();
      var country = String(formData.get("country") || "").trim();
      var customProfession = String(formData.get("profession_other") || "").trim();
      var customCountry = String(formData.get("country_other") || "").trim();

      if (profession === "other") {
        profession = customProfession;
      }

      if (country === "other") {
        country = customCountry;
      }

      var template = form.getAttribute("data-message-template") || "Hello, I want to build my digital presence.";
      var message = template
        .replace("{firstName}", firstName)
        .replace("{lastName}", lastName)
        .replace("{profession}", profession)
        .replace("{country}", country);
      var whatsappBase = form.getAttribute("data-whatsapp-base") || "https://wa.me/528131222331";
      var whatsappUrl = whatsappBase + "?text=" + encodeURIComponent(message);

      if (status) {
        status.textContent = form.getAttribute("data-status-message") || "";
      }

      window.open(whatsappUrl, "_blank", "noopener");
    });
  });

  document.querySelectorAll("[data-year]").forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });
});
