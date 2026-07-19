import { useState, useCallback } from "react";
import { evaluateRule } from "@/lib/formLogic";

export function validateField(field, value, ctx = {}) {
  // If the field is hidden by a visibility rule, it doesn't need validation
  if (field.visible_if && !evaluateRule(field.visible_if, ctx)) {
    return null;
  }

  // Required check
  if (field.required && (value === undefined || value === null || value === "")) {
    return field.error_message || "تکمیل این فیلد الزامی است.";
  }

  // If empty and not required, skip further checks
  if (value === undefined || value === null || value === "") {
    return null;
  }

  // String specific checks
  if (field.type === "text" || field.type === "textarea") {
    const strVal = String(value);
    
    if (field.min_length !== null && field.min_length !== undefined && strVal.length < field.min_length) {
      return field.error_message || `طول این فیلد نباید کمتر از ${field.min_length} کاراکتر باشد.`;
    }
    
    if (field.max_length !== null && field.max_length !== undefined && strVal.length > field.max_length) {
      return field.error_message || `طول این فیلد نباید بیشتر از ${field.max_length} کاراکتر باشد.`;
    }

    if (field.pattern) {
      try {
        const regex = new RegExp(field.pattern);
        if (!regex.test(strVal)) {
          return field.error_message || "فرمت وارد شده نامعتبر است.";
        }
      } catch (e) {
        console.error("Invalid regex pattern:", field.pattern);
      }
    }
  }

  // Number specific checks
  if (field.type === "number") {
    const numVal = parseFloat(value);
    
    if (isNaN(numVal)) {
      return field.error_message || "مقدار وارد شده باید عدد باشد.";
    }

    if (field.min_value !== null && field.min_value !== undefined && numVal < field.min_value) {
      return field.error_message || `مقدار این فیلد نباید کمتر از ${field.min_value} باشد.`;
    }
    
    if (field.max_value !== null && field.max_value !== undefined && numVal > field.max_value) {
      return field.error_message || `مقدار این فیلد نباید بیشتر از ${field.max_value} باشد.`;
    }
  }

  return null;
}

export function useFormValidation(fields, values) {
  const [errors, setErrors] = useState({}); // { [fieldId]: string }
  const [touched, setTouched] = useState({}); // { [fieldId]: boolean }

  const validateAll = useCallback(() => {
    const newErrors = {};
    let isValid = true;
    
    for (const field of fields) {
      const err = validateField(field, values[field.id], values);
      if (err) {
        newErrors[field.id] = err;
        isValid = false;
      }
    }
    
    setErrors(newErrors);
    
    // Mark all fields as touched to display errors
    const allTouched = {};
    for (const field of fields) {
      allTouched[field.id] = true;
    }
    setTouched(allTouched);

    return isValid;
  }, [fields, values]);

  const validateSingle = useCallback((fieldId) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return true;

    const err = validateField(field, values[fieldId], values);
    
    setErrors(prev => {
      const copy = { ...prev };
      if (err) copy[fieldId] = err;
      else delete copy[fieldId];
      return copy;
    });

    return !err;
  }, [fields, values]);

  const markTouched = useCallback((fieldId) => {
    setTouched(prev => ({ ...prev, [fieldId]: true }));
    validateSingle(fieldId);
  }, [validateSingle]);

  return { errors, touched, validateAll, validateSingle, markTouched };
}
