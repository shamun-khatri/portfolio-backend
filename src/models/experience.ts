import { Schema, model, Document } from 'mongoose';

interface IExperience extends Document {
  img: string;
  role: string;
  company: string;
  date: string;
  desc: string;
  skills: string[];
  doc?: string;
}

const experienceSchema = new Schema<IExperience>({
  img: { type: String, required: true },
  role: { type: String, required: true },
  company: { type: String, required: true },
  date: { type: String, required: true },
  desc: { type: String, required: true },
  skills: { type: [String], required: true },
  doc: { type: String, default: "" },
}, {
  timestamps: true
});

const Experience = model<IExperience>('Experience', experienceSchema);

export default Experience;
