import { Book } from '../types';

/**
 * Authentic, curated initial library books adhering strictly to the Book schema:
 * title, author, category (Fiction|Science|History|Kids|Others), image, description,
 * totalCopies, availableCopies, addedBy {name, email}, createdAt (Date).
 */
export const initialBooks: Omit<Book, '_id'>[] = [
  {
    title: "To Kill a Mockingbird",
    author: "Harper Lee",
    category: "Fiction",
    image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80",
    description: "Set in Maycomb, Alabama during the Great Depression, young Scout Finch watches her father, lawyer Atticus Finch, defend Tom Robinson—a Black man falsely accused of assault—in an unforgettable trial exploring justice, empathy, and courage.",
    totalCopies: 4,
    availableCopies: 4,
    addedBy: {
      name: "BookNook Curator",
      email: "curator@booknook.library",
    },
    createdAt: new Date(),
  },
  {
    title: "Project Hail Mary",
    author: "Andy Weir",
    category: "Science",
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80",
    description: "Ryland Grace is the lone survivor on an interstellar, last-chance space flight to neutralize an astronomical anomaly consuming the Sun's energy. With memories slowly returning, he devises ingenious experiments to save human civilization.",
    totalCopies: 4,
    availableCopies: 4,
    addedBy: {
      name: "BookNook Curator",
      email: "curator@booknook.library",
    },
    createdAt: new Date(),
  },
  {
    title: "Sapiens: A Brief History of Humankind",
    author: "Yuval Noah Harari",
    category: "History",
    image: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=600&q=80",
    description: "An evolutionary journey detailing how an insignificant ape became the ruler of planet Earth, exploring the cognitive, agricultural, and scientific revolutions that shaped modern societies.",
    totalCopies: 3,
    availableCopies: 3,
    addedBy: {
      name: "BookNook Curator",
      email: "curator@booknook.library",
    },
    createdAt: new Date(),
  },
  {
    title: "The Little Prince",
    author: "Antoine de Saint-Exupéry",
    category: "Kids",
    image: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80",
    description: "A poetic tale of a young prince who visits various planets in space, addressing themes of loneliness, friendship, love, and loss with timeless philosophical wonder.",
    totalCopies: 5,
    availableCopies: 5,
    addedBy: {
      name: "BookNook Curator",
      email: "curator@booknook.library",
    },
    createdAt: new Date(),
  },
  {
    title: "Clean Code: A Handbook of Agile Software Craftsmanship",
    author: "Robert C. Martin",
    category: "Others",
    image: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80",
    description: "A foundational text on disciplined engineering. Packed with pragmatic principles, patterns, and case studies, it demonstrates how clean architecture and readable code distinguish masters of the craft from novices.",
    totalCopies: 3,
    availableCopies: 3,
    addedBy: {
      name: "BookNook Curator",
      email: "curator@booknook.library",
    },
    createdAt: new Date(),
  },
  {
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    category: "Fiction",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
    description: "Bilbo Baggins lives a quiet, contentment-filled life in the Shire until the wizard Gandalf and a company of thirteen dwarves recruit him as their burglar on an epic quest to reclaim the Lonely Mountain from the dragon Smaug.",
    totalCopies: 5,
    availableCopies: 4,
    addedBy: {
      name: "BookNook Curator",
      email: "curator@booknook.library",
    },
    createdAt: new Date(),
  },
  {
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    category: "Science",
    image: "https://images.unsplash.com/photo-1507842229451-7f01be7f70d2?auto=format&fit=crop&w=600&q=80",
    description: "Nobel laureate Daniel Kahneman unpacks the human mind's dual architectures: fast, instinctive, emotional System 1 versus slow, deliberative, logical System 2, uncovering the pervasive cognitive heuristics shaping our choices.",
    totalCopies: 3,
    availableCopies: 3,
    addedBy: {
      name: "BookNook Curator",
      email: "curator@booknook.library",
    },
    createdAt: new Date(),
  },
  {
    title: "Guns, Germs, and Steel",
    author: "Jared Diamond",
    category: "History",
    image: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80",
    description: "A groundbreaking narrative exploring the geographical and environmental factors that shaped the modern world, arguing that gaps in power and technology between societies originated in environmental differences.",
    totalCopies: 2,
    availableCopies: 2,
    addedBy: {
      name: "BookNook Curator",
      email: "curator@booknook.library",
    },
    createdAt: new Date(),
  }
];
