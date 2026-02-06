import { Schema , model , Types} from 'mongoose';

export interface Conversation {
    title: String;
    departmentId: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const ConversationSchema = new Schema<Conversation>({
    title:{
        type: String,
        default: 'New Conversation',
    },
    departmentId:{
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
        index: true,
    }
},{timestamps: true}
);

const Conversation = model<Conversation>('Conversation', ConversationSchema);

export default Conversation;