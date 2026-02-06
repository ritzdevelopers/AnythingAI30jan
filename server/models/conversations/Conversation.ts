import { Schema , model , Types} from 'mongoose';

export interface Conversation {
    title: String;
    userId: Types.ObjectId;
    departmentId: Types.ObjectId;
    pinned?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const ConversationSchema = new Schema<Conversation>({
    title:{
        type: String,
        default: 'New Conversation',
    },
    userId:{
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    departmentId:{
        type: Schema.Types.ObjectId,
        ref: 'Department',
        required: true,
        index: true,
    },
    pinned: {
        type: Boolean,
        default: false,
    },
},{timestamps: true}
);

const Conversation = model<Conversation>('Conversation', ConversationSchema);

export default Conversation;