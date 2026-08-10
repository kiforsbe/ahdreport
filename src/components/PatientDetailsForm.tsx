import { useState } from "react";

export type PatientProfile = {
  name: string;
  personnummer: string;
  dateOfBirth: string;
  sex: string;
};
export const emptyPatientProfile: PatientProfile = {
  name: "",
  personnummer: "",
  dateOfBirth: "",
  sex: "",
};

export function PatientDetailsForm({
  initial,
  onFieldChange,
}: {
  initial: PatientProfile;
  onFieldChange: (field: keyof PatientProfile, value: string) => void;
}) {
  const [fields, setFields] = useState(initial);
  const update = (field: keyof PatientProfile, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    onFieldChange(field, value);
  };
  return (
    <>
      <div className="patient-fields">
      <label>
        <span>Name</span>
        <input
          type="text"
          value={fields.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </label>
      <label>
        <span>Personnummer</span>
        <input
          type="text"
          value={fields.personnummer}
          onChange={(e) => update("personnummer", e.target.value)}
        />
      </label>
      <label>
        <span>Date of birth</span>
        <input
          type="date"
          value={fields.dateOfBirth}
          onChange={(e) => update("dateOfBirth", e.target.value)}
        />
      </label>
      <label>
        <span>Sex</span>
        <input
          type="text"
          value={fields.sex}
          onChange={(e) => update("sex", e.target.value)}
        />
      </label>
      </div>
      <dl className="patient-export-details">
      {[
        ["Name", fields.name],
        ["Personnummer", fields.personnummer],
        ["Date of birth", fields.dateOfBirth],
        ["Sex", fields.sex],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
      </dl>
    </>
  );
}
